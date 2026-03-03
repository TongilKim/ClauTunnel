# ClauTunnel

[![npm version](https://img.shields.io/npm/v/@tongil_kim/clautunnel.svg)](https://www.npmjs.com/package/@tongil_kim/clautunnel)
[![npm downloads](https://img.shields.io/npm/dw/@tongil_kim/clautunnel.svg)](https://www.npmjs.com/package/@tongil_kim/clautunnel)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/TongilKim/ClauTunnel/pulls)

> **ClauTunnel** — Remote monitoring and control tool for **Claude Code CLI** from your mobile device. Stream terminal output in real-time, send input remotely, and get push notifications for task completion via iOS & Android.

## Why ClauTunnel?

Running Claude Code on your workstation but need to step away? ClauTunnel lets you keep the conversation going from your phone:

- **Monitor long-running tasks** — Watch Claude Code terminal output in real-time from anywhere
- **Send input remotely** — Respond to Claude's prompts and provide input from your mobile device
- **Push notifications** — Get notified instantly when tasks complete, errors occur, or input is needed
- **Background daemon mode** — Run ClauTunnel as a background service with automatic reconnection
- **Sleep prevention** — Keep your Mac awake during long-running Claude Code sessions

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
- **Supabase Project ID**: Dashboard → Settings → General → Project ID
- **Supabase Anon Key**: Dashboard → Settings → API Keys → Legacy anon Tab → Copy anon key

## Usage

```bash
# Create account (first time)
clautunnel signup

# Login (returning user)
clautunnel login

# Logout
clautunnel logout

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

- **Real-time streaming** — Terminal output streamed to your mobile device instantly
- **Remote input** — Send text input and commands from mobile to CLI
- **Push notifications** — Alerts for task completion, errors, and input prompts
- **Automatic reconnection** — Exponential backoff ensures reliable connections
- **Sleep prevention** — Keep macOS awake during long-running tasks
- **Daemon mode** — Run as a background service
- **Multi-platform mobile** — Works on both iOS and Android via Expo

## Requirements

- Node.js 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed
- Supabase account (free tier works)

## Links

- [GitHub Repository](https://github.com/TongilKim/ClauTunnel)
- [Mobile App](https://github.com/TongilKim/ClauTunnel/tree/main/apps/mobile)
- [npm Package](https://www.npmjs.com/package/@tongil_kim/clautunnel)
- [Report Issues](https://github.com/TongilKim/ClauTunnel/issues)

## License

[MIT](https://github.com/TongilKim/ClauTunnel/blob/main/LICENSE)
