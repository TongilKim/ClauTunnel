# ClauTunnel

[![npm version](https://img.shields.io/npm/v/@tongil_kim/clautunnel.svg)](https://www.npmjs.com/package/@tongil_kim/clautunnel)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-98.4%25-blue.svg)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/TongilKim/ClauTunnel/pulls)

📱 **Remote control for Claude Code CLI from your mobile device.**

Monitor and send inputs to Claude Code terminal sessions in real-time from your iOS or Android device.

---

## Why ClauTunnel?

Running Claude Code on your workstation but need to step away? ClauTunnel lets you keep the conversation going from your phone. Whether you're reviewing a long-running code generation, approving permission prompts, or sending follow-up instructions — you stay in control without being tied to your desk.

### How it compares to Claude CLI's built-in Remote Control

Claude Code CLI offers a built-in [`remote-control`](https://code.claude.com/docs/en/remote-control) command. Here's how ClauTunnel differs:

- **Works with any plan** — Remote Control is only available on Pro and Max plans, not on Team or Enterprise. ClauTunnel works with any plan, including API key users, because it uses your own Supabase infrastructure.
- **Multiple sessions across machines** — Remote Control supports only one session per instance. ClauTunnel lets you manage multiple sessions across multiple machines from a single mobile app.
- **Resilient connections** — Remote Control terminates permanently after ~10 minutes of network loss. ClauTunnel sessions persist through Supabase and reconnect without losing context.
- **Purpose-built mobile UI** — Remote Control uses the generic claude.ai web interface. ClauTunnel provides a native mobile experience with quick-access slash commands, image attachments from camera/gallery, and a model switcher.
- **Self-hosted, zero vendor lock-in** — All Remote Control traffic routes through Anthropic's servers. ClauTunnel runs on your own Supabase instance.

## Screenshots

### 📱 Session List

View and manage all your Claude Code sessions at a glance — see which are active, online, or offline.

<p align="center">
    <img src="docs/screenshots/sessions.png" width="300" alt="Session list" />
</p>

### ⚡ Slash Commands

Quickly access powerful commands like /clear, /compact, /resume, /rewind, and /config right from your phone.

<p align="center">
    <img src="docs/screenshots/commands.png" width="300" alt="Slash commands" />
</p>

### 💬 Live Chat

Chat with Claude Code in real-time from your mobile device, just like you would from the terminal.

<p align="center">
    <img src="docs/screenshots/chat.png" width="300" alt="Live chat" />
</p>

## Getting Started

### Prerequisites

- Node.js 18+
- [ngrok](https://ngrok.com) — used to tunnel the mobile app to your phone
- git — used to auto-clone the mobile app on first run
- Supabase account
- [Expo Go](https://expo.dev/go) installed on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))

### 1. Install CLI

**Using npm (Recommended)**

```bash
npm install -g @tongil_kim/clautunnel
```

**Using Homebrew (macOS)**

```bash
brew tap TongilKim/clautunnel
brew install clautunnel
```

### 2. Supabase Setup

Run the setup command to configure your Supabase credentials:

```bash
clautunnel setup
```

This will guide you through two steps:

1. **Supabase Project ID**: Found in Supabase Dashboard — Settings — General — Project ID
2. **Supabase Anon Key**: Found in Supabase Dashboard — Settings — API Keys — Legacy anon Tab — Copy anon key

### 3. Create Account

```bash
clautunnel signup   # new user
clautunnel login    # existing user
```

### 4. Start ClauTunnel

```bash
clautunnel start
```

This command does everything automatically:

1. Authenticates with Supabase using your stored credentials
2. Registers your machine in the database
3. Auto-clones the mobile app to `~/.clautunnel/repo/apps/mobile` (first run only)
4. Starts an **ngrok tunnel** and **Expo dev server**
5. Prints a **QR code** in your terminal

### 5. Connect Mobile App

1. Open **Expo Go** on your phone
2. Scan the **QR code** shown in your terminal
3. Log in with the same email and password you used in `clautunnel signup`
4. Tap **"+ New Session"** on your machine to start chatting with Claude

## Development

### Local Development

Run CLI and mobile app in separate terminals:

**Terminal 1 (CLI):**

```bash
cd apps/cli
pnpm start
```

**Terminal 2 (Mobile):**

```bash
cd apps/mobile
pnpm start

# Or with tunnel for different network (requires ngrok setup):
pnpm start:tunnel
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run CLI tests
pnpm --filter @tongil_kim/clautunnel test

# Run mobile tests
pnpm --filter clautunnel-mobile test

# Run shared package tests
pnpm --filter clautunnel-shared test
```

## Architecture

### How It Works

```
┌──────────────┐        Supabase Realtime        ┌──────────────┐
│   Desktop    │ ◄──────────────────────────────► │   Mobile     │
│              │   output, status, permissions    │              │
│  clautunnel  │   input, commands, responses     │  Expo app    │
│  start       │                                  │  (via Expo   │
│    │    │    │                                  │   Go + ngrok)│
│    │    ▼    │                                  └──────────────┘
│    │  Expo + │
│    │  ngrok  │──── QR code ──── scan with phone
│    ▼         │
│  Claude Code │
│  (Agent SDK) │
└──────────────┘
```

1. User runs `clautunnel start` — CLI registers the machine, auto-clones the mobile app, starts ngrok + Expo, and displays a QR code
2. User scans the QR code with Expo Go — the mobile app loads with pre-configured Supabase credentials
3. Mobile app sends a "start session" command via Supabase Realtime
4. CLI spawns a Claude Code process via the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk) (V2 Session API)
5. Claude output is streamed to the mobile app through Supabase Realtime
6. Input, slash commands, permission responses, and model switches from mobile are relayed back to Claude
7. Sessions can be paused, resumed, or ended from either side

## Contributing

Contributions are welcome! Please see the [Contributing Guide](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE)
