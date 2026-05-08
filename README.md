# Phantom Lab Chat

Backend + frontend kickoff for Telegram Mini App chat.

## Run

```bash
pnpm install
pnpm build
pnpm dev
```

API base URL: `http://localhost:3000/v1`

## Frontend (apps/web)

Run Mini App frontend in dev:

```bash
pnpm dev:web
```

Build frontend:

```bash
pnpm build:web
```

Frontend envs (`apps/web/.env.example`):
- `NEXT_PUBLIC_API_BASE_URL` (default: `http://localhost:3000/v1`)
- `NEXT_PUBLIC_CHAT_ID` (default: `main`)
- `NEXT_PUBLIC_DEV_INIT_DATA` (dev fallback when Telegram WebApp `initData` is absent)

Production deploy guide (Git + VPS + Docker + Nginx + SSL):
- [docs/VPS_DEPLOYMENT.md](docs/VPS_DEPLOYMENT.md)

Local dev note:
- if backend is started without real Telegram signature verification, set `ALLOW_INSECURE_INITDATA=true` in API env.

## Storage Drivers

- `STORAGE_DRIVER=inmemory` (default dev mode)
- `STORAGE_DRIVER=postgres` (Prisma + PostgreSQL)

For PostgreSQL mode:

```bash
cd apps/api
pnpm prisma:generate
pnpm prisma:migrate:dev
```

Detailed steps: [docs/POSTGRES_QUICKSTART.md](docs/POSTGRES_QUICKSTART.md)

## Smoke Scripts

- Postgres baseline smoke:
  - `pnpm --filter @phantom-lab/api smoke:postgres`
- Hardening smoke (focused regression + load/reliability checks):
  - `pnpm --filter @phantom-lab/api build`
  - `pnpm --filter @phantom-lab/api smoke:hardening`
  - optional tuning: `HARDENING_LOAD_USERS=8 HARDENING_LOAD_MESSAGES=80 pnpm --filter @phantom-lab/api smoke:hardening`
- Frontend P0 smoke (HTTP + WS integration contract):
  - `pnpm --filter @phantom-lab/api build`
  - `pnpm --filter @phantom-lab/api smoke:frontend-p0`

## Background Workers (in-process)

- Temp room auto-archive:
  - `TEMP_ROOM_AUTO_ARCHIVE_ENABLED=true|false` (default: `true`)
  - `TEMP_ROOM_AUTO_ARCHIVE_INTERVAL_SECONDS` (default: `30`)
- Incident mode auto-rollback:
  - `INCIDENT_MODE_AUTO_ROLLBACK_ENABLED=true|false` (default: `true`)
  - `INCIDENT_MODE_AUTO_ROLLBACK_INTERVAL_SECONDS` (default: `30`)
  - `INCIDENT_MODE_AUTO_ROLLBACK_MINUTES` (default: `0`, disabled until set > 0)
- Ticket SLA sweeper:
  - `TICKET_SLA_SWEEPER_ENABLED=true|false` (default: `true`)
  - `TICKET_SLA_SWEEPER_INTERVAL_SECONDS` (default: `30`)

## Join Policy

- Global join approval fallback:
  - `JOIN_APPROVAL_DEFAULT_MODE=manual|auto` (default: `manual`)
- Invite policy options (`POST /v1/chats/:chatId/invites`):
  - `approval_mode: "manual" | "auto"`
  - `target_role_id?: string` (assigned on auto-approve or on manual approve)

## E2E Message Mode

- `POST /v1/chats/:chatId/messages` accepts either:
  - plaintext payload: `text` and/or `media`
  - encrypted payload: `encrypted_payload`
- `encrypted_payload` and `text/media` are mutually exclusive.
- Server stores ciphertext envelope only (`isEncrypted`, `encryptedPayload`) and does not decrypt message content.
- Encrypted messages are immutable via `PATCH /v1/chats/:chatId/messages/:messageId` (edit rejected).
- Device key-bundle endpoints:
  - `POST /v1/chats/:chatId/e2e/devices`
  - `GET /v1/chats/:chatId/e2e/devices/me`
  - `GET /v1/chats/:chatId/e2e/devices?user_ids=<id1,id2,...>`
  - `POST /v1/chats/:chatId/e2e/devices/:deviceId/deactivate`
- Security policy envs:
  - `E2E_ALLOWED_MESSAGE_ALGORITHMS` (default: `xchacha20-poly1305,aes-256-gcm`)
  - `E2E_ALLOWED_DEVICE_ALGORITHMS` (default: `x25519`)
  - `E2E_MIN_ONE_TIME_PREKEYS` (default: `10`)
  - `E2E_MAX_ONE_TIME_PREKEYS` (default: `200`)

## Mini App Access Restriction

- Optional strict access control for Telegram Mini App auth:
  - `TELEGRAM_ACCESS_CHAT_ID` (example: `-1001234567890` or `@channel_username`)
  - `TELEGRAM_ACCESS_CHECK_ATTEMPTS` (default: `2`)
  - `TELEGRAM_ACCESS_CHECK_RETRY_DELAY_MS` (default: `250`)
- If set, `POST /v1/auth/telegram` allows login only when Telegram `getChatMember` confirms user membership.
- `restricted` users are accepted only when Telegram explicitly returns `is_member: true`.

## Message Retrieval Load Controls

- `GET /v1/chats/:chatId/messages` supports:
  - `before=<ISO datetime>` (return older messages only)
  - `limit=<1..500>` (return only tail chunk)
- `GET /v1/chats/:chatId/bootstrap` supports:
  - `messages_limit=<1..500>` (bounded initial snapshot for frontend bootstrap)
  - response includes: `chat`, `messages`, `identities`, `pagination.before`, `ws.namespace`, `serverTime`
- WebSocket `chat.join` snapshot is bounded by:
  - `WS_JOIN_SNAPSHOT_LIMIT` (default: `200`)

## WebSocket Security Controls

- `WS_CORS_ORIGINS`:
  - `*` for permissive dev mode
  - comma-separated origin allowlist for production
- `WS_MAX_HTTP_BUFFER_SIZE`:
  - max inbound WS frame size in bytes (default: `1000000`)
- WS per-user/per-event rate limits:
  - `WS_RATE_LIMIT_WINDOW_SECONDS` (default: `10`)
  - `WS_RATE_LIMIT_JOIN_MAX` (default: `20`)
  - `WS_RATE_LIMIT_SEND_MAX` (default: `60`)
  - `WS_RATE_LIMIT_EDIT_MAX` (default: `40`)
  - `WS_RATE_LIMIT_DELETE_MAX` (default: `30`)
  - `WS_RATE_LIMIT_REACTION_MAX` (default: `100`)
  - `WS_RATE_LIMIT_TYPING_MAX` (default: `120`)
  - `WS_RATE_LIMIT_MAX_BUCKETS` (default: `50000`, memory cap for active WS rate buckets)

## Auth + JWT Hardening Controls

- Auth endpoint abuse guard (`POST /v1/auth/telegram`):
  - `AUTH_RATE_LIMIT_WINDOW_SECONDS` (default: `60`)
  - `AUTH_RATE_LIMIT_MAX_ATTEMPTS` (default: `30`)
  - `AUTH_RATE_LIMIT_MAX_BUCKETS` (default: `20000`, memory cap for active IP buckets)
- JWT controls:
  - `JWT_SECRET` (`>=32` chars required in `production|staging`)
  - `JWT_ISSUER` (optional)
  - `JWT_AUDIENCE` (optional)
  - `JWT_ALLOWED_ALGORITHMS` (default: `HS256`, allowed: `HS256,HS384,HS512`)
  - `JWT_MAX_TOKEN_CHARS` (default: `4096`, applied to HTTP bearer + WS token)
- Refresh-session replay guard:
  - `POST /v1/auth/refresh` rotates refresh token (single-use refresh semantics)
  - `AUTH_REPLAY_STORE_DRIVER` (`auto|memory|redis`, default: `auto`)
  - `AUTH_REPLAY_KEY_PREFIX` (default: `auth:replay:`)
  - `AUTH_REPLAY_MEMORY_CLEANUP_INTERVAL_SECONDS` (default: `60`)
  - `AUTH_REPLAY_MEMORY_MAX_KEYS` (default: `200000`, memory fallback capacity cap)
  - `JWT_REFRESH_REPLAY_CLEANUP_INTERVAL_SECONDS` (default: `120`)
  - `JWT_REFRESH_REPLAY_FALLBACK_TTL_SECONDS` (default: `604800`)
  - note: replay keys are SHA-256 hashed before storage; legacy cleanup envs remain supported as fallback

## HTTP Input Hardening

- Body size limit: `API_BODY_LIMIT_BYTES` (default: `1048576`)
- Strict Transport Security header toggle: `ENABLE_HSTS=true|false` (default: `false`)
- HTTP CORS controls:
  - `API_CORS_ORIGINS` (default: `*`, or comma-separated origin allowlist)
  - `API_CORS_CREDENTIALS` (default: `false`)
  - `API_CROSS_ORIGIN_RESOURCE_POLICY` (default: `cross-origin`, allowed: `same-origin|same-site|cross-origin`)
- DTO validation is strict:
  - unknown properties are rejected (`forbidNonWhitelisted`)
  - unknown values are rejected (`forbidUnknownValues`)

## Implemented now

- `POST /v1/auth/telegram`
- `POST /v1/auth/refresh`
- `GET /v1/health`
- `GET /v1/chats/:chatId`
- `GET /v1/chats/:chatId/bootstrap`
- `GET /v1/chats/:chatId/messages`
- `POST /v1/chats/:chatId/messages`
- `PATCH /v1/chats/:chatId/messages/:messageId`
- `DELETE /v1/chats/:chatId/messages/:messageId`
- `POST /v1/chats/:chatId/e2e/devices`
- `GET /v1/chats/:chatId/e2e/devices/me`
- `GET /v1/chats/:chatId/e2e/devices`
- `POST /v1/chats/:chatId/e2e/devices/:deviceId/deactivate`
- `POST /v1/chats/:chatId/messages/:messageId/translate`
- `GET /v1/chats/:chatId/messages/:messageId/translations`
- `DELETE /v1/chats/:chatId/messages/:messageId/translations/:targetLanguage`
- `GET /v1/chats/:chatId/drafts`
- `POST /v1/chats/:chatId/drafts`
- `DELETE /v1/chats/:chatId/drafts/:draftId`
- `GET /v1/chats/:chatId/identities`
- `POST /v1/chats/:chatId/identities`
- `PATCH /v1/chats/:chatId/identities/:identityId`
- `GET /v1/chats/:chatId/roles`
- `POST /v1/chats/:chatId/roles`
- `PATCH /v1/chats/:chatId/roles/:roleId`
- `POST /v1/chats/:chatId/roles/:roleId/permissions/grant`
- `POST /v1/chats/:chatId/roles/:roleId/permissions/revoke`
- `POST /v1/chats/:chatId/roles/permissions/simulate`
- `POST /v1/chats/:chatId/roles/:roleId/assign`
- `POST /v1/chats/:chatId/roles/:roleId/unassign`
- `PATCH /v1/chats/:chatId/channel-notify/config`
- `POST /v1/chats/:chatId/channel-notify/test`
- `GET /v1/chats/:chatId/members`
- `POST /v1/chats/:chatId/members/:userId/mute`
- `POST /v1/chats/:chatId/members/:userId/unmute`
- `POST /v1/chats/:chatId/members/:userId/timeout`
- `POST /v1/chats/:chatId/members/:userId/timeout/clear`
- `POST /v1/chats/:chatId/members/:userId/kick`
- `POST /v1/chats/:chatId/members/:userId/ban`
- `POST /v1/chats/:chatId/members/:userId/unban`
- `POST /v1/chats/:chatId/members/:userId/tags`
- `GET /v1/chats/:chatId/invites`
- `POST /v1/chats/:chatId/invites`
- `POST /v1/chats/:chatId/invites/:inviteId/revoke`
- `PATCH /v1/chats/:chatId/invites/:inviteId`
- `POST /v1/chats/:chatId/invites/:inviteId/rotate-code`
- `POST /v1/chats/:chatId/invites/use`
- `GET /v1/chats/:chatId/join-requests`
- `POST /v1/chats/:chatId/join-requests`
- `POST /v1/chats/:chatId/join-requests/:requestId/approve`
- `POST /v1/chats/:chatId/join-requests/:requestId/reject`
- `GET /v1/chats/:chatId/join-policy`
- `PATCH /v1/chats/:chatId/join-policy`
- `GET /v1/chats/:chatId/members/:userId/profile-fields`
- `POST /v1/chats/:chatId/members/:userId/profile-fields`
- `DELETE /v1/chats/:chatId/members/:userId/profile-fields/:fieldKey`
- `POST /v1/chats/:chatId/tickets`
- `PATCH /v1/chats/:chatId/tickets/:ticketId`
- `GET /v1/chats/:chatId/tickets/sla/stats`
- `POST /v1/chats/:chatId/automation/rules`
- `PATCH /v1/chats/:chatId/automation/rules/:ruleId`
- `POST /v1/chats/:chatId/automation/rules/:ruleId/execute`
- `GET /v1/chats/:chatId/automation/rules/:ruleId/executions`
- `POST /v1/chats/:chatId/temp-rooms`
- `POST /v1/chats/:chatId/temp-rooms/:tempRoomId/archive`
- `POST /v1/chats/:chatId/temp-rooms/:tempRoomId/restore`
- `GET /v1/chats/:chatId/temp-rooms/:tempRoomId/export/history`
- `POST /v1/chats/:chatId/reputation/adjust`
- `POST /v1/chats/:chatId/incident-mode/enable`
- `POST /v1/chats/:chatId/incident-mode/disable`
- `POST /v1/chats/:chatId/knowledge/articles`
- `PATCH /v1/chats/:chatId/knowledge/articles/:articleId`
- `POST /v1/chats/:chatId/polls`
- `POST /v1/chats/:chatId/polls/:pollId/vote`
- `POST /v1/chats/:chatId/polls/:pollId/close`
- `GET /v1/chats/:chatId/polls/:pollId/results`
- `POST /v1/chats/:chatId/reminders`
- `GET /v1/chats/:chatId/reminders`
- `POST /v1/chats/:chatId/reminders/:reminderId/cancel`
- `POST /v1/chats/:chatId/alerts/keywords`
- `GET /v1/chats/:chatId/alerts/keywords`
- `DELETE /v1/chats/:chatId/alerts/keywords/:alertId`
- `POST /v1/chats/:chatId/bookmarks`
- `GET /v1/chats/:chatId/bookmarks`
- `DELETE /v1/chats/:chatId/bookmarks/:bookmarkId`
- `POST /v1/chats/:chatId/thread-subscriptions`
- `GET /v1/chats/:chatId/thread-subscriptions`
- `DELETE /v1/chats/:chatId/thread-subscriptions/:subscriptionId`
- `GET /v1/chats/:chatId/read-receipts/privacy`
- `PATCH /v1/chats/:chatId/read-receipts/privacy`
- `POST /v1/chats/:chatId/read-receipts/:messageId/mark`
- `GET /v1/chats/:chatId/read-receipts/:messageId`
- `GET /v1/chats/:chatId/unread-summary`

WS namespace: `/ws`
- events in: `chat.join`, `message.send`, `message.edit`, `message.delete`, `reaction.set`, `reaction.remove`, `typing.start`, `typing.stop`
- events out: `chat.snapshot`, `message.created`, `message.updated`, `message.deleted`, `message.reaction.updated`, `member.updated`, `member.banned`, `ticket.updated`, `automation.rule.executed`, `incident_mode.changed`, `reputation.updated`, `thread.subscription.triggered`, `broadcast.state.changed`, `broadcast.delivery.progress`

## Progress Tracking

See [docs/DEVELOPMENT_PROGRESS.md](docs/DEVELOPMENT_PROGRESS.md).

Frontend handoff checklist + E2E matrix:
- [docs/FRONTEND_INTEGRATION_HANDOFF.md](docs/FRONTEND_INTEGRATION_HANDOFF.md)

Frontend local run quickstart:
- [docs/FRONTEND_QUICKSTART.md](docs/FRONTEND_QUICKSTART.md)
