# MALV Backend State Report

## 1) Architecture Overview

MALV backend runs as a NestJS + TypeORM (MySQL) migration-first system with `synchronize: false`. Core operational layers are:

- Auth/session/roles + kill-switch
- **Workspace-scoped RBAC** (workspace roles, workspace role permissions, membership) layered on global permissions
- Chat/Beast orchestration
- Sandbox runtime with policy decisioning, typed actions, and approval controls
- Patch proposal review/apply controls
- DB-backed jobs + leases/shard metadata
- Realtime websocket updates
- File understanding/chunk + embedding retrieval pipeline
- **Multimodal deep extraction** (PDF/image/audio/video) via queued jobs with persisted structured output
- Calls + voice operator ingestion
- Admin runtime and supervision APIs

## 2) Subsystem Map

- `apps/api/src/auth`: authentication, JWT guard, global permission hydration, account/session lifecycle
- `apps/api/src/workspace`: workspace CRUD (create/list), membership role assignment, **WorkspaceAccessService** (effective workspace permission resolution + privacy-safe denied audits)
- `apps/api/src/chat`: chat ingress and Beast dispatch (optional `workspaceId` on REST + WS)
- `apps/api/src/beast`: planning/inference orchestration; operator sandbox runs respect workspace permissions when `workspaceId` is supplied
- `apps/api/src/sandbox`: command runtime, typed actions (structured + shell fallback), policy evaluation, approval/patch lifecycle; sandbox runs/files/reviews can carry `workspace_id`
- `apps/api/src/job-runner`: queue/lease/shard lifecycle + recovery flows; **processes `multimodal_deep_extract` jobs**
- `apps/api/src/file-understanding`: file registration, understanding queue, semantic retrieval, **multimodal deep extraction enqueue + read APIs**
- `apps/api/src/calls`: call session and transcript persistence
- `apps/api/src/voice`: voice transcript intent routing + operator dispatch (context `workspaceId`, workspace RBAC on operator runs when set)
- `apps/api/src/realtime`: user-scoped event streaming; JWT payload attaches `role` to sockets for workspace-aware downstream services
- `apps/api/src/admin`: supervisor/admin runtime contracts (replay includes `workspaceId` on run summary when bound)

## 3) Entity/Table Inventory

Key tables include users/roles/sessions, conversations/messages, memory/vault, ai_jobs/ai_job_leases/ai_workers, sandbox_runs, sandbox_command_records, sandbox_command_policy_decisions, sandbox_approval_requests, sandbox_patch_proposals, sandbox_typed_actions, sandbox_typed_action_policy_decisions, files/file_chunks/file_embeddings, call_sessions/call_transcripts, voice_operator_events, policy_definitions/policy_versions, audit_events, rate_limit_events.

**Workspace RBAC (migration `014-workspace-rbac-multimodal`):**

- `workspaces` — `owner_user_id`, `slug`, `name`
- `workspace_roles` — per-workspace `role_key` (`owner` | `member` | `reviewer`)
- `workspace_user_roles` — user membership + role binding (unique per user per workspace)
- `workspace_role_permissions` — grants `permissions` rows to workspace roles

**Workspace-scoped foreign keys (nullable for legacy personal scope):**

- `sandbox_runs.workspace_id`
- `files.workspace_id`
- `review_sessions.workspace_id`
- `operator_targets.workspace_id`

**Multimodal:**

- `multimodal_extractions` — `modality`, `status`, `unified_result`, `retrieval_text`, structured JSON columns (sections, page meta, tables/figures, segments, image analysis), `ai_job_id`, optional `workspace_id`

**Permissions added (migration 014):**

- `workspace.member.read`, `workspace.sandbox.execute`, `workspace.review.create`, `workspace.operator.dispatch`, `workspace.files.read`, `workspace.files.write`, `workspace.admin.manage`  
  Global **`admin`** role receives all `workspace.*` permissions for supervisor operations; effective **workspace** permissions are resolved via `workspace_user_roles` → `workspace_role_permissions`.

## 4) Migration Timeline

Current migration chain includes:

- `001` … `013` (see prior reports)
- **`014-workspace-rbac-multimodal`** — workspace RBAC tables, `multimodal_extractions`, workspace FK columns, workspace permission seeds, admin global grants for `workspace.*`

## 5) Endpoint Inventory (Operational)

- Chat: `POST v1/chat` — optional `workspaceId` (UUID) for workspace-scoped Beast operator runs
- **Workspaces:** `POST v1/workspaces`, `GET v1/workspaces`, `POST v1/workspaces/:workspaceId/members` (requires `workspace.admin.manage` within workspace)
- Sandbox control/admin: unchanged routes; still **admin-gated** for approval/patch listings (global admin role)
- Files: `POST v1/files` (optional `workspaceId`), `POST v1/files/:fileId/understand`, **`POST|GET v1/files/:fileId/multimodal/deep`**, `POST v1/files/retrieve`, `POST v1/files/:fileId/retrieve`
- Admin runtime: replay/run summaries include **`workspaceId`** when a run is workspace-bound

## 6) Realtime Event Inventory

Existing critical runtime/voice events continue (e.g. `job:update`, `sandbox:*`, `voice:*`).

Additional server-originated signals:

- `multimodal:queued`, `multimodal:update`, `multimodal:completed` (user room)

Socket handshake stores `{ userId, role }` on the socket for voice/chat paths that need global role for RBAC.

## 7) Job/Lease/Shard Model Summary

- Jobs persisted in `ai_jobs` with status/progress + shard metadata.
- **`multimodal_deep_extract`** job type: payload includes `extractionId`, `fileId`, `modality`; worker path runs `MultimodalDeepExtractService.processQueuedJob` under the normal lease acquisition loop.
- Lease ownership in `ai_job_leases` unchanged; stale recovery requeues running jobs when leases expire.

## 8) Runtime/Policy/Approval/Patch Lifecycle Summary

Unchanged core flow; additions:

- Typed actions can execute **without shell** for: `get_git_status`, `get_git_diff` (git in `OPERATOR_WORKSPACE_ROOT`), `patch_file` when `newContent` is provided (validated path), `search_repo` / `inspect_logs` (ripgrep from workspace root with node_modules exclusions), `run_tests` with a narrow allowed command-prefix guard.
- Sandbox runs created with `workspaceId` require **`workspace.sandbox.execute`** (and voice operator runs in a workspace also require **`workspace.operator.dispatch`**).
- File operations on workspace-scoped files require **`workspace.files.read`** / **`workspace.files.write`** as applicable.

## 9) Voice/Review/Multimodal Summary

- Voice context supports `workspaceId`; operator targets and review sessions persist optional `workspace_id` when present.
- Multimodal pipeline produces **retrieval-oriented text** plus structured JSON (PDF page counts + section hints, image dimensions, ffprobe-based audio/video metadata when `ffprobe` is available).

## 10) Security/Trust Boundaries

- Kill-switch enforcement unchanged on restricted dispatch/approval/patch flows.
- **Workspace permission denied** events use `audit_events.event_type = workspace_permission_denied` with non-sensitive metadata (ids + permission keys only).
- Global **admin** bypass for workspace checks remains explicit in `WorkspaceAccessService` (supervisor lane); non-admin users cannot rely on global JWT permission strings alone inside a workspace—membership grants apply.

## 11) Rate Limiting

- Existing `RateLimit` + `RateLimitGuard` pattern extended with optional **`limitEnvKey` / `windowEnvKey`** overrides via `ConfigService`.
- Files/multimodal/retrieve routes are rate-limited with env knobs such as `RATE_LIMIT_FILES_REGISTER_PER_MINUTE`, `RATE_LIMIT_FILES_RETRIEVE_PER_MINUTE`, `RATE_LIMIT_FILES_MULTIMODAL_DEEP_PER_MINUTE`, etc.

## 12) Test Coverage (This Batch)

- `workspace-access.service.spec.ts` — admin bypass + denied path + audit
- Existing suites retained (`permissions.guard`, `rate-limit.guard`, `operator-runtime`, `runtime-policy`, `voice-operator`)

## 13) Known Assumptions / Remaining Minor Follow-Ups

- **FFmpeg/ffprobe** and **git** must be available on PATH for full audio/video metadata and git-based typed actions in deployment environments.
- Deeper PDF layout/table detection can replace heuristic sections when a dedicated worker is added.
- Optional: expand integration tests against a real MySQL test database for full end-to-end persistence (current tests remain fast unit/service-level).
