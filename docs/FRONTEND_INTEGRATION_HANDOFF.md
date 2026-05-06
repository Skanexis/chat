# Frontend Integration Handoff

## 1) Status Snapshot

Date: 2026-04-29

Current status for frontend wiring:
- Core API + WS contracts implemented
- Tests green: `pnpm --filter @phantom-lab/api test` (`157/157`)
- Hardening smoke green: `pnpm --filter @phantom-lab/api smoke:hardening`
- Frontend P0 smoke green: `pnpm --filter @phantom-lab/api smoke:frontend-p0`
- Frontend production build green: `pnpm --filter @phantom-lab/web build`
- Mini App frontend integrated in `apps/web` (Next.js App Router, P0/P1/P2 surfaces wired)

Reference closure report:
- `docs/FRONTEND_ACCEPTANCE_REPORT_2026-04-29.md`

Result:
- P0/P1/P2 integration baseline is complete for current scope.

## 2) Integration Prerequisites

- API base URL: `http://localhost:3000/v1`
- WS namespace: `/ws`
- Auth entrypoint: `POST /v1/auth/telegram`
- Every protected HTTP request must send:
  - `Authorization: Bearer <accessToken>`
- WS auth accepts token from one of:
  - `auth.token`
  - query `token`
  - `Authorization: Bearer <accessToken>` header

## 3) Bootstrap Contract

1. Obtain `initData` from Telegram Mini App context.
2. Call `POST /v1/auth/telegram` with:
   - `initData: string` (required)
   - `chatId?: string` (optional, default is `main`)
3. Store `accessToken` in memory (session scope).
4. Fetch initial chat context with one call:
   - `GET /v1/chats/:chatId/bootstrap?messages_limit=100`
   - response includes `chat`, `messages`, `identities`, `pagination.before`, `ws.namespace`, `serverTime`
5. Connect Socket.IO to `/ws` with token.
6. Emit `chat.join` and wait for `chat.snapshot`.

## 4) Frontend API Checklist

### P0 Core Chat

- [x] Auth + token storage + token injection for HTTP and WS
- [x] Chat bootstrap (`GET /chats/:chatId/bootstrap`)
- [x] Send message (`POST /chats/:chatId/messages`)
- [x] Edit/delete own message (`PATCH/DELETE /chats/:chatId/messages/:messageId`)
- [x] Reactions (`GET/POST/DELETE /chats/:chatId/messages/:messageId/reactions`)
- [x] Typing indicators via WS (`typing.start`, `typing.stop`)
- [x] Error handling for `401`, `403`, `404`, `429`

### P1 Productive UX

- [x] Search/pin/saved views
- [x] Drafts and scheduled messages
- [x] Read receipts + privacy mode
- [x] Message translations
- [x] Alerts/keyword + thread subscriptions
- [x] Reminders + bookmarks

### P2 Admin/Advanced

- [x] Roles/permissions simulation
- [x] Invite and join approval flows
- [x] Tickets + automation execution views
- [x] Incident mode controls
- [x] Broadcast management pages
- [x] Temp room lifecycle and archive export

## 5) WS Event Reference

Client -> server:
- `chat.join` `{ chatId }`
- `message.send` `{ chatId, payload }`
- `message.edit` `{ chatId, messageId, payload }`
- `message.delete` `{ chatId, messageId }`
- `reaction.set` `{ chatId, messageId, payload }`
- `reaction.remove` `{ chatId, messageId }`
- `typing.start` `{ chatId }`
- `typing.stop` `{ chatId }`

Server -> client:
- `chat.snapshot`
- `message.created`
- `message.updated`
- `message.deleted`
- `message.reaction.updated`
- `member.updated`
- `member.banned`
- `ticket.updated`
- `automation.rule.executed`
- `incident_mode.changed`
- `reputation.updated`
- `thread.subscription.triggered`
- `broadcast.state.changed`
- `broadcast.delivery.progress`
- `typing.start`
- `typing.stop`

## 6) Error and UX Guardrails

- `401 Unauthorized`:
  - missing/invalid token; force re-auth.
- `403 Forbidden`:
  - role/permission/state restriction; show permission hint.
- `404 Not Found`:
  - stale entity id; refresh list/snapshot.
- `429 Too Many Requests`:
  - flood/slowmode/limit; show retry/cooldown message.
- `400 Bad Request`:
  - payload validation; highlight invalid fields.

## 7) Prioritized E2E Matrix

| ID | Priority | Scenario | API/WS Coverage | Expected Result |
|---|---|---|---|---|
| E2E-P0-01 | P0 | Auth success | `POST /auth/telegram` | `201`, token returned, membership present |
| E2E-P0-02 | P0 | Protected route without token | `GET /chats/:chatId` | `401` |
| E2E-P0-03 | P0 | Initial snapshot after join | WS `chat.join`, event `chat.snapshot` | Snapshot contains chat + messages |
| E2E-P0-04 | P0 | Send message | `POST /chats/:chatId/messages` | `201`, message appears in list and `message.created` |
| E2E-P0-05 | P0 | Edit/delete own message | `PATCH/DELETE /messages/:messageId` | `200`, events `message.updated/deleted` |
| E2E-P0-06 | P0 | Reactions flow | `POST/DELETE /messages/:messageId/reactions` | Summary updates via API and WS |
| E2E-P0-07 | P0 | `member` cannot send as group | `POST /messages` with `sender_mode=as_group` | `403` |
| E2E-P0-08 | P0 | Moderation mute -> unmute regression | `POST /members/:userId/mute`, send, `unmute`, send | muted send blocked, post-unmute send allowed |
| E2E-P0-09 | P0 | Scheduled message execution | `POST /messages/scheduled`, `GET /messages/scheduled` | status transitions to `sent` |
| E2E-P0-10 | P0 | Typing fanout | WS `typing.start/stop` | other members receive typing events |
| E2E-P1-01 | P1 | Search and filters | `GET /messages/search` | filtered result set is correct |
| E2E-P1-02 | P1 | Pin/unpin messages | `POST /messages/:id/pin`, `/unpin`, `GET /messages/pinned` | pin state visible and reversible |
| E2E-P1-03 | P1 | Draft lifecycle | `GET/POST/DELETE /drafts` | create/list/delete stable |
| E2E-P1-04 | P1 | Translation cache flow | `POST /translate`, `GET /translations` | translation item visible and reusable |
| E2E-P1-05 | P1 | Read receipt privacy modes | `PATCH /read-receipts/privacy`, `POST/GET /read-receipts/:messageId` | visibility obeys mode/policy |
| E2E-P1-06 | P1 | Thread subscription trigger | `POST /thread-subscriptions`, send reply | `thread.subscription.triggered` event emitted |
| E2E-P1-07 | P1 | Keyword alerts | `POST /alerts/keywords`, send matching message | alert trigger path active |
| E2E-P2-01 | P2 | Invite manual approval flow | invites + join-requests endpoints | pending -> approved/rejected works |
| E2E-P2-02 | P2 | Incident mode toggle | `POST /incident-mode/enable|disable` | state changes + `incident_mode.changed` |
| E2E-P2-03 | P2 | Ticket workflow baseline | `POST/PATCH /tickets` | valid state transitions only |
| E2E-P2-04 | P2 | Automation execution baseline | `POST /automation/rules`, `execute`, `executions` | run logged, execution status returned |
| E2E-P2-05 | P2 | Broadcast state machine | broadcasts create/approve/schedule/publish/pause/resume/cancel | transitions are valid and visible |

## 8) Suggested Frontend Rollout Order

Status as of 2026-04-29:
1. Complete P0 checklist and E2E-P0 matrix.
2. Ship internal alpha for chat core (no admin pages required).
3. Add P1 productivity features.
4. Add P2 admin/advanced surfaces.

## 9) Operational Smoke Before Each Frontend Release

- `pnpm --filter @phantom-lab/api build`
- `pnpm --filter @phantom-lab/api test`
- `pnpm --filter @phantom-lab/api smoke:hardening`
- `pnpm --filter @phantom-lab/api smoke:frontend-p0`
- `pnpm --filter @phantom-lab/web build`
