# ClauTunnel

Remote monitoring and control for Claude Code CLI from your mobile device.

## Installation

**npm (Recommended)**

```bash
npm install -g @tongil_kim/clautunnel
```

**Homebrew (macOS)**

```bash
brew tap TongilKim/clautunnel
brew install clautunnel
```

## Setup

Run the setup command to configure your Supabase credentials:

```bash
clautunnel setup
```

You'll need:
- **Supabase Project URL**: Dashboard → Settings → API (e.g., `https://xxxx.supabase.co`)
- **Supabase Anon Key**: Dashboard → Settings → API → `anon` `public` key

## Usage

```bash
# Authenticate
clautunnel login

# Start a session
clautunnel start

# Start in daemon mode (background)
clautunnel start --daemon

# Prevent sleep while running (macOS)
clautunnel start --prevent-sleep

# Check status
clautunnel status

# Stop the daemon
clautunnel stop
```

## Features

- Real-time terminal output streaming to mobile
- Send input from mobile to CLI
- Push notifications for task completion, errors, and input prompts
- Automatic reconnection with exponential backoff
- Sleep prevention option for long-running tasks

## Requirements

- Node.js 18+
- Claude Code CLI installed

## Links

- [GitHub Repository](https://github.com/TongilKim/clautunnel)
- [Mobile App](https://github.com/TongilKim/clautunnel/tree/main/apps/mobile)

## License

MIT