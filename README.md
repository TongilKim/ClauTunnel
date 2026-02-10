# TermBridge

Remote control for Claude Code CLI from your mobile device.

## Overview

TermBridge allows you to monitor and control Claude Code CLI sessions running on your computer from your iOS or Android device. See terminal output in real-time and send inputs remotely.

<p align="center">
  <img src="docs/screenshots/sessions.png" width="250" alt="Session list" />
  <img src="docs/screenshots/commands.png" width="250" alt="Slash commands" />
  <img src="docs/screenshots/chat.png" width="250" alt="Live chat" />
</p>

## Tech Stack

- **CLI Wrapper**: Node.js + TypeScript + node-pty
- **Mobile App**: React Native + Expo (iOS & Android)
- **Backend**: Supabase (Realtime, Auth, Database)
- **Monorepo**: pnpm workspaces

## Features

- 📱 Real-time terminal output streaming to mobile
- ⌨️ Send input from mobile to CLI
- 🔄 Automatic reconnection with exponential backoff
- 🌙 Dark mode support
- 🔐 Secure authentication with Supabase

## Project Structure

```
TermBridge/
├── apps/
│   ├── cli/                  # CLI wrapper package
│   │   └── src/
│   │       ├── commands/     # CLI commands (start, stop, status, login, setup)
│   │       ├── daemon/       # Background daemon logic
│   │       ├── realtime/     # Supabase realtime connection
│   │       └── utils/        # Config, logger, prompt, supabase utilities
│   └── mobile/               # Expo mobile app
│       └── src/
│           ├── components/   # React Native components
│           ├── screens/      # App screens
│           ├── stores/       # Zustand state management
│           └── utils/        # Presence and shared utilities
├── packages/
│   └── shared/               # Shared types and constants
├── supabase/
│   └── migrations/           # Database schema
└── package.json
```

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

## License

MIT
