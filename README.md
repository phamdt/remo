# remo — Remote Cursor Agent API

TypeScript HTTP service that runs Cursor SDK agents on server-defined git workspaces. Designed as the backend for the [remomo](https://github.com/phamdt/remomo) Android app.

## Features

- Server-defined workspaces and repos (`config/workspaces.json`, `config/repos.json`)
- Create, continue, and cancel agent runs via REST
- Live progress streaming over Server-Sent Events (SSE)
- Git worktrees per run; optional branch push and GitHub PR creation
- SQLite metadata store (no prompts stored in DB)

## Prerequisites

- **Node.js 24+**
- **Git** (worktree support)
- **Cursor API key** (`CURSOR_API_KEY`)
- Optional: `gh` CLI for PR creation

### Windows

Install [Node.js 24+](https://nodejs.org/) and [Git for Windows](https://git-scm.com/download/win). Use PowerShell or cmd from the repo root.

## Quick start

```powershell
git clone https://github.com/phamdt/remo.git
cd remo
npm install

$env:REMOTE_AGENT_TOKEN = "dev-token"
$env:CURSOR_API_KEY = "your-cursor-api-key"
npm run dev
```

Server starts on port **8080** by default.

```powershell
curl http://localhost:8080/health
# {"ok":true}
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REMOTE_AGENT_TOKEN` | Yes | — | Bearer token for API auth |
| `CURSOR_API_KEY` | Yes | — | Cursor SDK key |
| `PORT` | No | `8080` | Listen port |
| `REMOTE_AGENT_DATA` | No | cwd | Data root for config, DB, runs |
| `REMOTE_AGENT_APPLY_TOKEN` | No | — | Required bearer for `apply` mode if set |
| `GITHUB_TOKEN` / `GH_TOKEN` | No | — | GitHub token for push/PR |
| `CURSOR_MODEL_ID` | No | `claude-4-sonnet` | Default agent model |

## API overview

Base URL: `http://localhost:8080` (or your deployed host).

All `/v1/*` routes require `Authorization: Bearer <REMOTE_AGENT_TOKEN>`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/v1/workspaces` | List workspaces |
| `POST` | `/v1/runs` | Create a run |
| `GET` | `/v1/runs/{id}` | Get run summary |
| `GET` | `/v1/runs/{id}/events` | SSE event stream |
| `POST` | `/v1/runs/{id}/continue` | Send follow-up prompt |
| `POST` | `/v1/runs/{id}/cancel` | Cancel run |

Full spec: [`docs/remote-cursor-agent-api-spec.md`](docs/remote-cursor-agent-api-spec.md)

### Example: list workspaces

```powershell
curl -H "Authorization: Bearer dev-token" http://localhost:8080/v1/workspaces
```

### Example: create a run

```powershell
curl -X POST http://localhost:8080/v1/runs `
  -H "Authorization: Bearer dev-token" `
  -H "Content-Type: application/json" `
  -d '{"workspaceId":"demo-workspace","mode":"plan_only","prompt":"Summarize the repo"}'
```

## Mobile app (remomo)

Pair with the [remomo](https://github.com/phamdt/remomo) Android client:

1. Start this API on your machine (`npm run dev`).
2. In the remomo app **Settings**, set:
   - **Base URL:** `http://10.0.2.2:8080` (Android emulator → host) or your HTTPS deploy URL
   - **Bearer token:** same as `REMOTE_AGENT_TOKEN`
3. Tap connection test → workspace list should load.

## Development

```powershell
npm run dev        # hot reload (tsx watch)
npm start          # production-style start
npm test           # run tests
npm run typecheck  # TypeScript check
```

## Project layout

```
remo/
├── config/          # repos.json, workspaces.json
├── docs/            # API specification
├── src/
│   ├── routes/      # HTTP handlers
│   ├── services/    # Run lifecycle, SSE bus
│   ├── agent/       # Cursor SDK runner
│   ├── git/         # Worktrees, publish
│   └── security/    # Auth, secrets, limits
└── tests/           # Vitest tests
```

## License

See [LICENSE](LICENSE).
