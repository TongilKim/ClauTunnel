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

## Overview

ClauTunnel allows you to monitor and control Claude Code CLI sessions running on your computer from your iOS or Android device. See terminal output in real-time and send inputs remotely.

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
- pnpm 8+
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

### 4. Start Listening

```bash
clautunnel start
```

### 5. Connect Mobile App

Open the ClauTunnel mobile app via Expo Go and connect to your session.

## ClauTunnel vs Claude CLI Remote Control

Claude Code CLI offers a built-in [`remote-control`](https://code.claude.com/docs/en/remote-control) command. Here's why ClauTunnel exists as a separate solution:

### Remote Control cannot be used on Team or Enterprise plans

Remote Control is a **research preview** available only on Pro and Max plans.
It is explicitly **not available on Team or Enterprise plans** — the exact tiers where organizations manage multiple developers.
ClauTunnel works with **any plan**, including API key users, because it uses your own Supabase infrastructure.

### One session per instance

Remote Control supports **only one remote session per Claude Code instance**.
ClauTunnel lets you manage **multiple sessions across multiple machines** from a single mobile app — ideal for developers running Claude Code on several workstations or servers.

### 10-minute network timeout kills the session

If your machine loses network connectivity for ~10 minutes, the Remote Control session **terminates permanently** and must be restarted from scratch.
ClauTunnel sessions persist through Supabase and can **reconnect without losing context**.

### No mobile-native experience

Remote Control uses the generic claude.ai web interface or the Claude app, which are not optimized for controlling a CLI session on a small screen.
ClauTunnel provides a **purpose-built mobile UI** with quick-access slash commands, image attachments from camera/gallery, and a model switcher — designed specifically for mobile-to-terminal workflows.

### Self-hosted, zero vendor lock-in

All Remote Control traffic routes through Anthropic's API servers.
ClauTunnel runs on **your own Supabase instance** — your session data, auth, and relay infrastructure stay under your control.

## Tech Stack

- **CLI**: Node.js + TypeScript + [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk)
- **Mobile App**: React Native + Expo (iOS & Android)
- **Backend**: Supabase (Realtime, Auth, Database)
- **Monorepo**: pnpm workspaces

<details>
<summary><strong>📁 Project Structure</strong></summary>

```
ClauTunnel/
├── apps/
│   ├── cli/                    # CLI package (@tongil_kim/clautunnel)
│   │   └── src/
│   │       ├── commands/       # CLI commands (setup, signup, login, start, stop, status)
│   │       ├── daemon/         # Daemon, SDK session wrapper, machine/session management
│   │       ├── realtime/       # Supabase realtime connection
│   │       └── utils/          # Config, logger, prompt, supabase utilities
│   └── mobile/                 # Expo mobile app
│       └── src/
│           ├── components/     # React Native components
│           ├── screens/        # App screens
│           ├── stores/         # Zustand state management
│           └── utils/          # Presence and shared utilities
├── packages/
│   └── shared/                 # Shared types and constants
├── supabase/
│   └── migrations/             # Database schema
└── package.json
```

</details>

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
│  start       │                                  │              │
│      │       │                                  └──────────────┘
│      ▼       │
│  Claude Code │
│  (Agent SDK) │
└──────────────┘
```

1. User runs `clautunnel start` — CLI registers the machine in Supabase and listens for mobile connections
2. Mobile app connects and sends a "start session" command
3. CLI spawns a Claude Code process via the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk) (V2 Session API)
4. Claude output is streamed to the mobile app through Supabase Realtime
5. Input, slash commands, permission responses, and model switches from mobile are relayed back to Claude
6. Sessions can be paused, resumed, or ended from either side

## Contributing

Contributions are welcome! Please see the [Contributing Guide](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE)
