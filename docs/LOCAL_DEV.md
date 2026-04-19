# Local development (MALV monorepo)

## Ports (defaults)

| Service        | Default port | Where it comes from |
|----------------|-------------|---------------------|
| Web (Vite)     | 5173        | `apps/web/vite.config.ts` (preflight checks this; root `WEB_PORT` in `.env.example` is documentation unless you wire Vite `envDir`) |
| API (Nest)     | 8080        | `API_PORT` → `apps/api/src/main.ts` |
| Supervisor     | 8090        | `SUPERVISOR_PORT` → `apps/supervisor/src/main.ts` |
| llama-server (local chat-completions HTTP) | 8081 | `MALV_LOCAL_CPU_INFERENCE_BASE_URL` (legacy `MALV_LOCAL_INFERENCE_BASE_URL`) / `MALV_LLAMACPP_BASE_URL` default in code; must not use the API port |
| Beast worker   | 9090        | FastAPI orchestration — `apps/beast-worker` uvicorn (`BEAST_WORKER_PORT`); keep `BEAST_WORKER_BASE_URL` aligned (this is **not** the model port) |

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

## Web to API routing (chat/brain health)

- Web chat requests (`/v1/chat`, `/v1/chat/brain-health`) use `VITE_API_BASE_URL` via `apps/web/src/lib/api/http-core.ts`.
- This project currently uses a direct API origin for web API calls, not a Vite `/v1` proxy.
- Leave `VITE_API_BASE_URL` unset for local dev (defaults to `http://localhost:8080`), or set it explicitly to `http://localhost:8080`.
- Do not set `VITE_API_BASE_URL` to relative values like `/` or `/v1`; those target the Vite origin (`localhost:5173`) and can return HTML instead of MALV API JSON.

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
