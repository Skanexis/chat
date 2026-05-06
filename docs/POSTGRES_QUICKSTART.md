# PostgreSQL Quickstart

## 1) Start DB

```bash
docker compose up -d postgres
```

For BullMQ broadcast queue also start Redis:

```bash
docker compose up -d redis
```

## 2) Configure API env

Copy `apps/api/.env.example` to `apps/api/.env` and set:

```env
STORAGE_DRIVER=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/phantom_lab_chat?schema=public
JWT_SECRET=replace-with-strong-secret-at-least-32-chars
JWT_ISSUER=
JWT_AUDIENCE=
JWT_ALLOWED_ALGORITHMS=HS256
JWT_MAX_TOKEN_CHARS=4096
AUTH_REPLAY_STORE_DRIVER=auto
AUTH_REPLAY_KEY_PREFIX=auth:replay:
AUTH_REPLAY_MEMORY_CLEANUP_INTERVAL_SECONDS=60
AUTH_REPLAY_MEMORY_MAX_KEYS=200000
JWT_REFRESH_REPLAY_CLEANUP_INTERVAL_SECONDS=120
JWT_REFRESH_REPLAY_FALLBACK_TTL_SECONDS=604800
# optional: BullMQ worker queue for broadcasts
BROADCAST_QUEUE_DRIVER=bullmq
REDIS_URL=redis://localhost:6379
# optional: Telegram channel notification pipeline
TELEGRAM_BOT_TOKEN=<your_bot_token>
TELEGRAM_ACCESS_CHAT_ID=<required_chat_id_if_you_want_group_only_login>
TELEGRAM_INITDATA_MAX_AGE_SECONDS=300
TELEGRAM_INITDATA_FUTURE_SKEW_SECONDS=30
TELEGRAM_INITDATA_REPLAY_CLEANUP_INTERVAL_SECONDS=60
AUTH_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_RATE_LIMIT_MAX_ATTEMPTS=30
AUTH_RATE_LIMIT_MAX_BUCKETS=20000
TELEGRAM_NOTIFY_CHANNEL_ID=@your_channel_or_chat_id
CHANNEL_NOTIFY_QUIET_HOURS_ENABLED=false
CHANNEL_NOTIFY_QUIET_HOURS_START=23:00
CHANNEL_NOTIFY_QUIET_HOURS_END=07:00
CHANNEL_NOTIFY_TIMEZONE=UTC
# optional: chat anti-abuse guards
CHAT_LINK_DENYLIST=spam.test,bad.example
CHAT_LINK_ALLOWLIST=
CHAT_FLOOD_WINDOW_SECONDS=10
CHAT_FLOOD_MAX_MESSAGES=12
CHAT_DUPLICATE_WINDOW_SECONDS=120
CHAT_DUPLICATE_THRESHOLD=3
CHAT_MAX_TEXT_LENGTH_DEFAULT=4000
CHAT_MAX_TEXT_LENGTH_BY_ROLE_JSON={"member":2000,"admin":4000}
CHAT_BLOCKED_KEYWORDS=
CHAT_BLOCKED_REGEX_PATTERNS=
CHAT_MEDIA_ALLOWED_TYPES=image,video,audio,file
CHAT_MEDIA_ALLOWED_EXTENSIONS_JSON={"image":[".png",".jpg",".jpeg",".webp"],"video":[".mp4",".webm"],"audio":[".mp3",".ogg"]}
# optional: anti-abuse auto-sanctions (13.3)
CHAT_AUTOSANCTION_ENABLED=true
CHAT_AUTOSANCTION_WINDOW_HOURS=24
CHAT_AUTOSANCTION_STEP1=warn
CHAT_AUTOSANCTION_STEP2=short_mute
CHAT_AUTOSANCTION_STEP3=long_mute
CHAT_AUTOSANCTION_STEP4=ban
CHAT_AUTOSANCTION_SHORT_MUTE_SECONDS=300
CHAT_AUTOSANCTION_LONG_MUTE_SECONDS=3600
# optional: broadcast validation guardrails
BROADCAST_CREATE_COOLDOWN_SECONDS=30
BROADCAST_ALLOWED_PLACEHOLDERS=first_name,chat_name,unread_count
BROADCAST_AUDIENCE_MAX_INACTIVE_DAYS=365
BROADCAST_ALLOWED_LOCALES=
BROADCAST_QUIET_HOURS_ENABLED=false
BROADCAST_QUIET_HOURS_START=23:00
BROADCAST_QUIET_HOURS_END=07:00
BROADCAST_TIMEZONE=UTC
BROADCAST_BLACKOUT_WINDOWS=
BROADCAST_IDEMPOTENCY_TTL_SECONDS=86400
# optional: outbound webhook delivery (integrations)
WEBHOOK_DELIVERY_MAX_ATTEMPTS=3
WEBHOOK_DELIVERY_TIMEOUT_MS=5000
WEBHOOK_DELIVERY_BACKOFF_MS=250
# optional: scheduled messages
SCHEDULED_MESSAGE_MAX_DELAY_HOURS=720
# optional: drafts/reminders/alerts/read-receipts
DRAFT_SEND_MAX_DELAY_HOURS=720
DRAFT_PENDING_LIMIT=100
REMINDER_MAX_DELAY_HOURS=720
REMINDER_PENDING_LIMIT=100
KEYWORD_ALERT_MAX_PER_USER=25
KEYWORD_ALERT_DEDUP_SECONDS=300
READ_RECEIPTS_MODE_DEFAULT=private
# optional: transport and websocket hardening
API_BODY_LIMIT_BYTES=1048576
ENABLE_HSTS=false
API_CORS_ORIGINS=*
API_CORS_CREDENTIALS=false
API_CROSS_ORIGIN_RESOURCE_POLICY=cross-origin
WS_RATE_LIMIT_WINDOW_SECONDS=10
WS_RATE_LIMIT_JOIN_MAX=20
WS_RATE_LIMIT_SEND_MAX=60
WS_RATE_LIMIT_EDIT_MAX=40
WS_RATE_LIMIT_DELETE_MAX=30
WS_RATE_LIMIT_REACTION_MAX=100
WS_RATE_LIMIT_TYPING_MAX=120
WS_RATE_LIMIT_MAX_BUCKETS=50000
```

## 3) Generate Prisma Client and run migrations

```bash
cd apps/api
pnpm prisma:generate
pnpm prisma:migrate:dev
```

## 4) Start API

```bash
cd ../..
pnpm dev
```

## 5) Run automated Postgres smoke

This runs a local API instance in `STORAGE_DRIVER=postgres` mode and validates:
- `auth -> chat -> message`
- member permission denials (`roles`, `channel-notify/config` => `403`)
- owner flow (`roles` + `channel-notify/config` + `channel-notify/test`)

```bash
pnpm --filter @phantom-lab/api smoke:postgres
```

Optional:

```bash
SMOKE_PORT=3210 pnpm --filter @phantom-lab/api smoke:postgres
```

## 6) Run hardening smoke (regression + load/reliability)

This runs a broader scenario set in `STORAGE_DRIVER=postgres` mode:
- RBAC regression checks (`member` denies, owner elevated flow)
- moderation regression (`mute -> forbidden send -> unmute -> send`)
- incident mode toggle (`enable/disable`)
- scheduled message execution (`scheduled -> sent`)
- multi-user load burst with message count verification

```bash
pnpm --filter @phantom-lab/api build
STORAGE_DRIVER=postgres HARDENING_LOAD_USERS=6 HARDENING_LOAD_MESSAGES=60 pnpm --filter @phantom-lab/api smoke:hardening
```

Optional:

```bash
HARDENING_PORT=3220 HARDENING_LOAD_USERS=8 HARDENING_LOAD_MESSAGES=80 pnpm --filter @phantom-lab/api smoke:hardening
```

## 7) Run frontend P0 smoke (HTTP + WS integration matrix)

This validates frontend-critical P0 flows end-to-end:
- auth/bootstrap contracts
- protected-route auth guard behavior
- websocket `chat.join` snapshot
- message create/edit/delete + WS fanout
- reactions flow + WS summary updates
- `as_group` deny for regular member
- moderation regression (`mute -> send blocked -> unmute -> send`)
- scheduled message execution
- typing fanout (`typing.start/stop`)

```bash
pnpm --filter @phantom-lab/api build
STORAGE_DRIVER=postgres pnpm --filter @phantom-lab/api smoke:frontend-p0
```

Optional:

```bash
FRONTEND_P0_PORT=3230 pnpm --filter @phantom-lab/api smoke:frontend-p0
```

## Notes

- In `postgres` mode the app uses `PrismaDatabaseService`.
- Base chat + system roles are seeded automatically on first DB access.
- If `BROADCAST_QUEUE_DRIVER=bullmq` and Redis is unreachable, API falls back to in-memory queue driver.
