# Frontend Quickstart

## 1) Start API for local frontend dev

Backend must be running before `apps/web`.

Example (`inmemory` + insecure initData for local UI testing):

```bash
cd apps/api
ALLOW_INSECURE_INITDATA=true pnpm dev
```

API base URL used by frontend: `http://localhost:3000/v1`

## 2) Configure frontend env

Copy `apps/web/.env.example` values into your local `.env.local` for the web app:

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/v1`
- `NEXT_PUBLIC_CHAT_ID=main`
- `NEXT_PUBLIC_DEV_INIT_DATA=...` (used outside Telegram WebApp)

## 3) Run frontend

```bash
pnpm dev:web
```

Open `http://localhost:3001`.

## 4) P0 flows available in `apps/web`

- auth bootstrap (`/auth/telegram`)
- initial snapshot (`/chats/:chatId/bootstrap`)
- realtime socket (`/ws` + `chat.join`)
- send/edit/delete message
- set/remove reaction
- typing indicator fanout

## 5) Regression gate

Before frontend release/integration checkpoints:

```bash
pnpm --filter @phantom-lab/api smoke:frontend-p0
```
