# TermBridge - Project Context

## Workflow Rules

- **Do not commit unless I confirm it** - Always wait for explicit user confirmation before creating any git commits.

## Overview

TermBridge is a CLI tool for remote monitoring and control of Claude Code sessions. It connects to Supabase for real-time communication.

## Project Structure

```
apps/
  cli/              # Main CLI package (@tongil_kim/termbridge)
    src/
      commands/     # CLI commands (start, stop, status, login, setup)
      daemon/       # Background daemon logic
      realtime/     # Supabase realtime connection
      utils/        # Config, logger utilities
packages/
  shared/           # Shared types (termbridge-shared)
```

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for TDD methodology and coding standards.

```bash
# Install dependencies
pnpm install

# Build
pnpm --filter @tongil_kim/termbridge build

# Run tests
pnpm --filter @tongil_kim/termbridge test
```

### Local Dev

Run in separate terminals:

```bash
# Terminal 1 - CLI
cd apps/cli && pnpm start

# Terminal 2 - Mobile
cd apps/mobile && pnpm start
# Or with tunnel: pnpm start:tunnel
```

## Release Procedure

### Automatic Release (Recommended)

1. Update version in `apps/cli/package.json`
2. Commit: `git commit -m "chore: Bump version to X.Y.Z"`
3. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. GitHub Actions automatically publishes to npm and updates Homebrew formula

### Manual Release (If tag trigger fails)

```bash
gh workflow run release.yml -f version=X.Y.Z
gh run watch
```

### Verify Release

```bash
npm view @tongil_kim/termbridge version
curl -s https://raw.githubusercontent.com/TongilKim/homebrew-termbridge/main/Formula/termbridge.rb | head -6
```

### Required GitHub Secrets

- `NPM_TOKEN`: npm access token for publishing
- `HOMEBREW_TAP_TOKEN`: GitHub PAT with repo scope for homebrew-termbridge

## SDK Architecture (Claude Agent SDK)

TermBridge uses the V2 Session API (`unstable_v2_createSession`) to communicate with the Claude Code subprocess.

### Key Concepts

- **AskUserQuestion goes through the `canUseTool` callback**, NOT through the stream as a special message type.
  - The subprocess sends a `control_request` with `subtype: "can_use_tool"` and blocks waiting for a `control_response`.
  - The SDK calls the `canUseTool(toolName, input, options)` callback provided at session creation.
  - For AskUserQuestion: the callback must return `{ behavior: 'allow', updatedInput: { questions, answers } }`.
  - `session.send()` writes a NEW user message to stdin — it does NOT unblock pending control_requests.
- **V2 `stream()` returns after each `result` message** — `startStreamLoop()` must loop to handle multi-turn conversations.
- **`processControlRequest`** in the SDK only handles three subtypes: `can_use_tool`, `hook_callback`, `mcp_message`.

### Key Files

- `apps/cli/src/daemon/sdk-session.ts` — V2 Session wrapper, handles AskUserQuestion via `canUseTool`, permission requests, model switching, conversation history
- `apps/cli/src/daemon/daemon.ts` — Wires SDK session events to Supabase realtime broadcasts
- `apps/cli/src/realtime/client.ts` — Supabase realtime client for mobile communication

### Testing Notes

- Mock `createMockSession` must block on subsequent `stream()` calls (use `await new Promise(() => {})`) to prevent infinite loop in `startStreamLoop()`.
- AskUserQuestion tests capture the `canUseTool` callback from `mockedCreateSession.mockImplementation((opts) => ...)` and call it manually to simulate the SDK's internal control_request flow.
