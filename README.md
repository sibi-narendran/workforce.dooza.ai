# Clawed Setup

Personal AI assistant platform powered by Clawdbot.

## Project Structure

```
clawed setup/
├── clawdbot/           # Main codebase (TypeScript)
│   ├── src/            # Source code
│   ├── ui/             # Web UI
│   ├── extensions/     # Channel plugins
│   ├── skills/         # 65+ capabilities
│   ├── apps/           # Native apps (macOS/iOS/Android)
│   └── package.json    # Dependencies
├── CLAUDE.md           # Project context
└── README.md           # This file
```

## Features

- **Multi-channel inbox** — WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, Microsoft Teams, and more
- **Pi agent framework** — Powered by Claude Opus 4.5
- **SQLite + sqlite-vec memory** — Local-first persistence
- **65+ skills/tools** — Extensive automation capabilities
- **Native apps** — macOS menu bar, iOS, and Android
- **Voice support** — Voice Wake and Talk Mode

## Quick Start

```bash
cd clawdbot
pnpm install
pnpm build
pnpm clawdbot onboard --install-daemon
```

## Development

```bash
cd clawdbot
pnpm install
pnpm build

# Dev loop (auto-reload)
pnpm gateway:watch
```

## Documentation

- [Full Documentation](https://docs.clawd.bot)
- [Getting Started](https://docs.clawd.bot/start/getting-started)
- [Configuration](https://docs.clawd.bot/gateway/configuration)

## Tech Stack

- **Runtime**: TypeScript, Node.js 22+
- **Build**: pnpm, Bun (optional)
- **Database**: SQLite + sqlite-vec
- **LLM**: Anthropic Claude (Opus 4.5 recommended)
- **UI**: Lit-based control UI

## License

MIT
