# Agent guide — remo (Remote Cursor Agent API)

Context for AI coding agents working in this repository.

## TL;DR

- **Stack:** Node.js 24+, TypeScript (strict), Hono, Zod, Vitest, `@cursor/sdk`, SQLite.
- **Run:** `npm run dev` (needs `REMOTE_AGENT_TOKEN` + `CURSOR_API_KEY`).
- **Test:** `npm test` after behavior changes.
- **Mobile client:** [`phamdt/remomo`](https://github.com/phamdt/remomo) — Kotlin Multiplatform Android app that calls this `/v1` API.
- **Rules:** Small diffs; match local style; never add `version:` to docker-compose files.

## What this is

TypeScript HTTP API that runs on a server (designed for a GCP VM). It accepts HTTPS requests from the remomo mobile app, materializes git worktrees for server-defined workspaces, runs Cursor SDK agents, streams progress via SSE, and can push branches / open GitHub PRs.

The mobile app never sends repo URLs or filesystem paths — only `workspaceId` and prompts from `config/workspaces.json`.

## First session

1. Install **Node.js 24+** and **Git**.
2. From repo root: `npm install`.
3. Set required env vars (PowerShell example):

```powershell
$env:REMOTE_AGENT_TOKEN = "dev-token"
$env:CURSOR_API_KEY = "your-cursor-key"
$env:REMOTE_AGENT_DATA = "C:\path\to\remo"
npm run dev
```

4. Health check: `GET http://localhost:8080/health` → `{ "ok": true }`.

### Windows developers

Use **PowerShell** or **cmd** from the repo root. Commands are the same (`npm install`, `npm run dev`, `npm test`). Git for Windows is required for worktree support.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `REMOTE_AGENT_TOKEN` | Yes | Bearer token for `/v1/*` auth |
| `CURSOR_API_KEY` | Yes | Cursor SDK API key |
| `GITHUB_TOKEN` / `GH_TOKEN` | No | Git push / PR creation |
| `REMOTE_AGENT_APPLY_TOKEN` | No | Separate token for `mode: "apply"` runs |
| `CURSOR_MODEL_ID` | No | Default: `claude-4-sonnet` |
| `REMOTE_AGENT_DATA` | No | Data root (default: cwd) |
| `PORT` | No | Default: `8080` |
| `MAX_CONCURRENT_RUNS` | No | Default: `3` |
| `RUN_TIMEOUT_MS` | No | Default: `1800000` (30 min) |

## Repository map

| Area | Role |
|------|------|
| `src/index.ts` | Entry point |
| `src/server.ts` | Hono app, `/health`, mounts `/v1` |
| `src/routes/v1.ts` | All `/v1` endpoints |
| `src/api-schema.ts` | Zod request schemas |
| `src/services/run-service.ts` | Run lifecycle |
| `src/services/event-bus.ts` | SSE fan-out |
| `src/agent/runner.ts` | `@cursor/sdk` integration |
| `src/git/` | Worktrees + publish |
| `src/db/` | SQLite metadata |
| `src/security/` | Secrets, env scrubbing, limits |
| `config/repos.json` | Server-defined git repos |
| `config/workspaces.json` | Curated repo bundles for mobile |
| `docs/remote-cursor-agent-api-spec.md` | Full API spec |
| `tests/` | Vitest unit/integration tests |

## API endpoints

All `/v1/*` routes require `Authorization: Bearer <REMOTE_AGENT_TOKEN>`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/v1/workspaces` | List server-defined workspaces |
| `POST` | `/v1/runs` | Create run → `{ id }` |
| `GET` | `/v1/runs/{id}` | Run summary |
| `GET` | `/v1/runs/{id}/events` | SSE stream |
| `POST` | `/v1/runs/{id}/continue` | Follow-up prompt |
| `POST` | `/v1/runs/{id}/cancel` | Cancel active run |

## Tests

```powershell
npm test           # vitest run
npm run test:watch # watch mode
npm run typecheck  # tsc --noEmit
```

When you add or change behavior, **add or update unit tests** under `tests/`. Most tests mock the run service and do not need live API keys.

## remomo integration

| remomo component | remo counterpart |
|------------------|------------------|
| `RemoteAgentApi.kt` | `/v1` routes in `src/routes/v1.ts` |
| `ApiModels.kt` | `src/types.ts`, `src/api-schema.ts` |
| `SseEvent.kt` | `src/types.ts` `SseEvent` union |
| In-app Settings (base URL + token) | `REMOTE_AGENT_TOKEN`, `PORT` |

Local dev pairing:
- API on host: `http://localhost:8080`
- Android emulator in remomo Settings: `http://10.0.2.2:8080`

## Conventions

- Prefer **small, targeted diffs**; match naming and error handling of surrounding code.
- Do **not** add a `version:` key to any docker-compose file.
- Prompts and transcripts are **not** stored in SQLite — only run metadata.
- Secrets are scrubbed from `process.env` after startup (`src/security/secrets.ts`).

## Agent workflow

1. Read relevant source before editing — especially `docs/remote-cursor-agent-api-spec.md` for API changes.
2. If changing request/response shapes, update **both** remo and remomo DTOs to stay aligned.
3. Run `npm test` and `npm run typecheck` before finishing.
4. Do not commit `.env` files or API keys.
