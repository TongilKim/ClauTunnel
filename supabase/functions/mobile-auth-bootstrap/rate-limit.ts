async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export interface BootstrapClaimRateLimitRecord {
  keyHash: string;
  attemptCount: number;
  windowStartedAt: string;
}

export interface BootstrapClaimRateLimitStore {
  cleanupExpired(cutoffIso: string): Promise<void>;
  get(keyHash: string): Promise<BootstrapClaimRateLimitRecord | null>;
  put(record: BootstrapClaimRateLimitRecord): Promise<void>;
}

export interface BootstrapClaimRateLimitParams {
  clientKey: string;
  now: Date;
  maxAttempts: number;
  windowMs: number;
}

export interface BootstrapClaimRateLimitResult {
  allowed: boolean;
  retryAfterSec?: number;
}

export async function takeBootstrapClaimRateLimit(
  store: BootstrapClaimRateLimitStore,
  { clientKey, now, maxAttempts, windowMs }: BootstrapClaimRateLimitParams
): Promise<BootstrapClaimRateLimitResult> {
  const keyHash = await sha256(clientKey);
  const nowMs = now.getTime();
  const cutoffMs = nowMs - windowMs;
  const cutoffIso = new Date(cutoffMs).toISOString();

  await store.cleanupExpired(cutoffIso);

  const existing = await store.get(keyHash);
  if (!existing) {
    await store.put({
      keyHash,
      attemptCount: 1,
      windowStartedAt: now.toISOString(),
    });
    return { allowed: true };
  }

  const windowStartedMs = new Date(existing.windowStartedAt).getTime();
  if (windowStartedMs <= cutoffMs) {
    await store.put({
      keyHash,
      attemptCount: 1,
      windowStartedAt: now.toISOString(),
    });
    return { allowed: true };
  }

  if (existing.attemptCount >= maxAttempts) {
    const retryAfterMs = Math.max(windowStartedMs + windowMs - nowMs, 0);
    return {
      allowed: false,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
    };
  }

  await store.put({
    keyHash,
    attemptCount: existing.attemptCount + 1,
    windowStartedAt: existing.windowStartedAt,
  });
  return { allowed: true };
}
