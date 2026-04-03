# Local development (MALV monorepo)

## Ports (defaults)

| Service        | Default port | Where it comes from |
|----------------|-------------|---------------------|
| Web (Vite)     | 5173        | `apps/web/vite.config.ts` (preflight checks this; root `WEB_PORT` in `.env.example` is documentation unless you wire Vite `envDir`) |
| API (Nest)     | 8080        | `API_PORT` → `apps/api/src/main.ts` |
| Supervisor     | 8090        | `SUPERVISOR_PORT` → `apps/supervisor/src/main.ts` |
| Beast worker   | 9090        | `apps/beast-worker/package.json` `dev` script (`uvicorn --port`); keep `BEAST_WORKER_BASE_URL` in `.env` aligned |

Copy `.env.example` to `.env` and adjust.

## Commands (repo root)

| Goal | Command |
|------|---------|
| Full stack (preflight + all services) | `npm run dev` |
| Port / conflict check only | `npm run dev:check` |
| Skip port preflight | `SKIP_DEV_PREFLIGHT=1 npm run dev` |
| Start stack without preflight (same as old `dev`) | `npm run dev:raw` |
| Web only | `npm run dev -w @malv/web` |
| API only | `npm run dev -w @malv/api` |
| Beast worker only | `npm run dev -w @malv/beast-worker` |
| Supervisor only | `npm run dev -w @malv/supervisor` |

## Override ports

- **API / Supervisor:** set `API_PORT` / `SUPERVISOR_PORT` in `.env` or inline: `API_PORT=8081 npm run dev -w @malv/api`
- **Web:** `npm run dev -w @malv/web -- --port 3000` or change `server.port` in `apps/web/vite.config.ts`
- **Beast:** change `--port` in `apps/beast-worker/package.json` and update `BEAST_WORKER_BASE_URL` in `.env`

## Clear stale processes (macOS / Linux)

When something fails with `EADDRINUSE`:

```bash
npm run dev:check
# or for one port:
lsof -nP -iTCP:8090 -sTCP:LISTEN
kill <PID>
```

Use `kill -9 <PID>` only if a normal `kill` does not release the port.

## Non-port failures

If preflight passes but a service exits, read the **concurrently**-prefixed log for that service (WEB / API / BEAST / SUP). Typical causes: database unreachable, missing `.env`, Python/Node import errors—not detected by port checks.
