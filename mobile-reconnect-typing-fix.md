# Mobile Reconnect: isTyping 상태 미복원 버그

## Root Cause

### isTyping: true가 되는 경로 (4곳, 모두 사용자 액션)

| 위치 | 트리거 |
|---|---|
| `connectionStore.ts:402` | `sendInput()` — 사용자가 메시지 보냄 |
| `connectionStore.ts:483` | `sendResumeRequest()` — 세션 resume |
| `connectionStore.ts:684` | `sendUserAnswer()` — 질문에 답함 |
| `connectionStore.ts:724` | `sendPermissionResponse()` — 권한 응답 |

서버 측에서 "지금 처리 중"이라고 알려주는 경로가 **전혀 없음**.

### 재접속 흐름 추적

1. `connect()` → `isTyping: false`로 리셋 (line 135)
2. DB에서 히스토리 로드 — `complete`, `request-queued`는 DB에 저장되지 않으므로 처리 상태 추론 불가
3. `requestPendingState()` → `status-request` 전송
4. 데몬 핸들러 (`daemon.ts:302-319`) → **pending question/permission만 체크**, `isActive()` 확인 안 함
5. Claude가 처리 중이어도 모바일에 아무것도 안 보냄 → **`isTyping: false` 유지**

## Edge Case: pending question + isProcessing

pending question/permission이 있을 때도 `sdkSession.isActive()`는 `true`를 반환함 (SDK가 사용자 응답을 기다리며 블로킹 중이므로 `isProcessing`이 여전히 `true`).

단순히 `isProcessing: true`만 보내면:

1. `user-question` 브로드캐스트 → `isTyping: false`, `pendingQuestion` 설정 (질문 모달 표시)
2. `status-response` 브로드캐스트 → `isTyping: true` ← **질문 모달이 떠있는데 typing indicator도 표시됨 (잘못됨)**

따라서 `status-response`의 `isProcessing`은 **"사용자 입력 대기가 아닌 실제 작업 중"** 상태만 `true`로 보내야 함.

## 수정 방안 (5개 파일)

### 1. `packages/shared/src/types/message.ts`

- `RealtimeMessageType`에 `'status-response'` 추가
- `RealtimeMessage`에 `isProcessing?: boolean`, `isMessageQueued?: boolean` 필드 추가

### 2. `apps/cli/src/daemon/sdk-session.ts`

- `hasPendingPrompt(): boolean` 메서드 추가 (`this.pendingPrompt !== null`)

### 3. `apps/cli/src/realtime/client.ts`

- `broadcastStatusResponse(isProcessing: boolean, isMessageQueued: boolean)` 메서드 추가
- `broadcastComplete` 등과 동일한 패턴, DB 저장 없이 realtime broadcast만

### 4. `apps/cli/src/daemon/daemon.ts` — `status-request` 핸들러 확장

```typescript
// 기존 pending question/permission re-broadcast 유지
// + 추가:
const isProcessing = this.sdkSession.isActive();
const hasPendingQuestion = !!this.sdkSession.getPendingQuestionData();
const hasPendingPermission = !!this.sdkSession.getPendingPermissionData();
const isMessageQueued = this.sdkSession.hasPendingPrompt();

// 실제 작업 중일 때만 true (사용자 입력 대기 상태 제외)
const isActivelyWorking = isProcessing && !hasPendingQuestion && !hasPendingPermission;

await this.realtimeClient.broadcastStatusResponse(isActivelyWorking, isMessageQueued);
```

### 5. `apps/mobile/src/stores/connectionStore.ts` — `status-response` 핸들링 추가

```typescript
if (message.type === 'status-response') {
  set({
    isTyping: message.isProcessing ?? false,
    isMessageQueued: message.isMessageQueued ?? false,
  });
  return;
}
```

## 결과

이 수정으로 reconnect 시 모든 상태가 정확히 복원됨:

| 상태 | 복원 방식 |
|---|---|
| Claude 작업 중 | `status-response.isProcessing: true` → typing indicator 표시 |
| 큐잉된 메시지 있음 | `status-response.isMessageQueued: true` → "Message queued..." 표시 |
| pending question/permission | 기존 re-broadcast로 모달 표시 (typing indicator 없음) |
| Claude idle | `status-response.isProcessing: false` → typing indicator 없음 |
