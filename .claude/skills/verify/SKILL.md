---
name: verify
description: Build, run, and drive the Ristoranti Chat app (NestJS API + Next.js Telegram Mini App) to verify changes at runtime.
---

# Verify: Ristoranti Chat

## Build
- `pnpm --filter @phantom-lab/web build` and `pnpm --filter @phantom-lab/api build` from repo root.

## Run
- **API (port 3000):** `pnpm --filter @phantom-lab/api dev` is BROKEN — tsx/esbuild does not emit decorator metadata, so Nest constructor DI fails at boot (`AuthRateLimitGuard: Cannot read properties of undefined`). Instead build then run from dist: `pnpm --filter @phantom-lab/api start`.
- `apps/api/.env` has `STORAGE_DRIVER=inmemory`, so no Postgres/Redis needed locally. Health check: `curl http://localhost:3000/v1/health`.
- **Web (port 3001):** `pnpm --filter @phantom-lab/web dev`. If a stale dev server is already on 3001 serving 404s for `/_next` chunks after file changes, kill it and start fresh — hydration silently never happens otherwise (page renders SSR HTML only, no client JS runs).

## Drive
- Open `http://localhost:3001/chat/main`. Outside Telegram, dev auth falls back to `appConfig.devInitData` (`apps/web/src/lib/config.ts`) — a fake user id 990001, works with the in-memory driver.
- Playwright is not a repo dependency. Install it in the session scratchpad (`npm i playwright@1.61.1`); Chromium binaries are already cached in `%LOCALAPPDATA%\ms-playwright`.
- Key selectors: `.app-splash` / `.app-splash-video` (entry splash), `.app-title-copy h1` (chat title), `.ds-pinned-banner`, `.ds-state-icon.is-loading` (init spinner).

## Gotchas
- ffmpeg (if media work needed): installed via winget at `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*\bin` (not on PATH in existing shells).
- A pre-existing hydration-mismatch warning ("2 Issues" dev overlay badge) comes from the Telegram web-app script setting `--tg-viewport-*` styles on `<html>` — not a regression.
- The Prisma/Postgres path (`STORAGE_DRIVER=postgres`) cannot be verified locally: no Postgres, no Docker. It runs in CI (`.github/workflows/postgres-smoke.yml`) and on the VPS.
