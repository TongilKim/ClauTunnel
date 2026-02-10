# TermBridge

[![npm version](https://img.shields.io/npm/v/@tongil_kim/termbridge.svg)](https://www.npmjs.com/package/@tongil_kim/termbridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-98.4%25-blue.svg)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/TongilKim/TermBridge/pulls)

📱 **Remote control for Claude Code CLI from your mobile device.**

Monitor and send inputs to Claude Code terminal sessions in real-time from your iOS or Android device.

---

## Why TermBridge?

Running Claude Code on your workstation but need to step away? TermBridge lets you keep the conversation going from your phone. Whether you're reviewing a long-running code generation, approving permission prompts, or sending follow-up instructions — you stay in control without being tied to your desk.

## Overview

TermBridge allows you to monitor and control Claude Code CLI sessions running on your computer from your iOS or Android device. See terminal output in real-time and send inputs remotely.

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

## Quick Start

```bash
# Install
npm install -g @tongil_kim/termbridge

# Configure Supabase credentials
termbridge setup

# Authenticate
termbridge login

# Start listening for mobile connections
termbridge start
```

Then open the TermBridge mobile app, and you're connected!

## Features

- 📱 Real-time terminal output streaming to mobile
- ⌨️ Send input from mobile to CLI
- 🔄 Automatic reconnection with exponential backoff
- 🌙 Dark mode support
- 🔐 Secure authentication with Supabase

## Tech Stack

- **CLI Wrapper**: Node.js + TypeScript + node-pty
- **Mobile App**: React Native + Expo (iOS & Android)
- **Backend**: Supabase (Realtime, Auth, Database)
- **Monorepo**: pnpm workspaces

<details>
<summary><strong>📁 Project Structure</strong></summary>

```
TermBridge/
├── apps/
│   ├── cli/                    # CLI wrapper package
│   │   └── src/
│   │       ├── commands/       # CLI commands (start, stop, status, login, setup)
│   │       ├── daemon/         # Background daemon logic
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

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Supabase account

### Installation

**Using npm (Recommended)**

```bash
npm install -g @tongil_kim/termbridge
```

**Using Homebrew (macOS)**

```bash
brew tap TongilKim/termbridge
brew install termbridge
```

**From source**

```bash
# Clone the repository
git clone https://github.com/TongilKim/termbridge.git
cd termbridge

# Install dependencies
pnpm install

# Build packages
pnpm build
```

### CLI Setup

After installation, run the setup command to configure your Supabase credentials:

```bash
termbridge setup
```

This will prompt you for:

- **Supabase Project URL**: Found in Supabase Dashboard → Settings → API (e.g., `https://xxxx.supabase.co`)
- **Supabase Anon Key**: Found in Supabase Dashboard → Settings → API → `anon` `public` key

Alternatively, set these in your shell profile (e.g., `~/.zshrc` or `~/.bashrc`):

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-anon-key
```

### Mobile App Setup

Create `.env` file for the mobile app:

```bash
# apps/mobile/.env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Supabase Setup

1. Create a new Supabase project
2. Run the database migration:

```bash
supabase db push
```

### CLI Usage

```bash
# First-time setup (configure Supabase credentials)
termbridge setup

# Authenticate
termbridge login

# Start listening for session requests from mobile
termbridge start

# Start with a custom machine name
termbridge start --name "Work Laptop"

# Start with automatic sleep prevention
termbridge start --prevent-sleep

# Check connection status
termbridge status

# Stop the running daemon
termbridge stop
```

### Mobile App

```bash
cd apps/mobile

# Start development server
pnpm start

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

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

# Or with tunnel for different network:
pnpm start:tunnel
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run CLI tests
pnpm --filter @tongil_kim/termbridge test

# Run mobile tests
pnpm --filter termbridge-mobile test

# Run shared package tests
pnpm --filter termbridge-shared test
```

## Architecture

### CLI Flow

1. User runs `termbridge start`
2. CLI spawns Claude Code process via node-pty
3. CLI creates session in Supabase database
4. PTY output is broadcast to Supabase Realtime channel
5. Mobile app connects to the same channel to receive output
6. Input from mobile is sent via Realtime to CLI
7. CLI writes input to PTY

## Contributing

Contributions are welcome! Please see the [Contributing Guide](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE)
