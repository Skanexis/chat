# ТЗ: Frontend Design System для Telegram Mini App Chat

Версия: 1.0  
Дата: 2026-04-28  
Статус: Ready for implementation

## 1. Основание

Документ собран на базе:
- `TECH_SPEC_TELEGRAM_MINI_APP_CHAT.md`
- `docs/DEVELOPMENT_PROGRESS.md`
- `docs/FRONTEND_INTEGRATION_HANDOFF.md`

Цель: зафиксировать единое ТЗ для дизайн-системы фронта, которая покрывает все текущие и целевые функции продукта (P0/P1/P2 + advanced/admin).

## 2. Цели дизайн-системы

- Обеспечить единый UI-каркас для chat, productivity и admin-функций.
- Гарантировать предсказуемые состояния для real-time, permission-driven и лимитируемых сценариев.
- Ускорить поставку новых экранов за счет стандартизированных токенов, компонентов и паттернов.
- Минимизировать UX-регрессии при масштабировании функционала.

## 3. Технические ограничения

- Платформа: Telegram Mini App (mobile-first webview).
- Текущий фронт: Next.js App Router + React 19 + TypeScript.
- Transport: REST + Socket.IO (`/ws`).
- Auth: `POST /v1/auth/telegram`, далее Bearer token для HTTP/WS.
- UI должен корректно работать при `chat_mode`, `channel_mode`, `hybrid_mode`.

## 4. Архитектура дизайн-системы

### 4.1 Слои

1. Foundations: design tokens, типографика, сетка, motion, z-index, иконки.
2. Primitives: `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Avatar`, `Tooltip`, `Modal`.
3. Patterns: `FormSection`, `FilterBar`, `DataTable`, `EventTimeline`, `PermissionGate`, `StateBlock`.
4. Feature Kits:
- Chat Kit
- Moderation Kit
- Admin Kit
- Productivity Kit
- Broadcast/Automation Kit

### 4.2 Токены (обязательные)

- Color semantic: `bg.*`, `surface.*`, `text.*`, `border.*`, `accent.*`, `success.*`, `warning.*`, `danger.*`, `info.*`.
- Typography: `font.family.sans|mono`, `font.size.12..32`, `font.weight.400|500|600|700`, `line.height.*`.
- Spacing: scale `4, 8, 12, 16, 20, 24, 32, 40`.
- Radius: `sm=8`, `md=12`, `lg=16`, `xl=20`, `pill=999`.
- Shadows: `elevation.1..4`.
- Motion: `fast=120ms`, `base=180ms`, `slow=260ms`, easing `standard`, `exit`.
- Z-index: `base`, `sticky`, `dropdown`, `overlay`, `modal`, `toast`.

### 4.3 Режимы тем

- `theme.light` и `theme.dark`.
- Telegram-aware слой (`safe-area`, webview paddings, compact density).
- Доступность: контраст не ниже WCAG AA для интерактивных элементов.

## 5. Глобальные UX-состояния (единый стандарт)

Для каждого виджета/экрана обязательны состояния:
- `loading`
- `empty`
- `ready`
- `updating`
- `error`
- `forbidden (403)`
- `unauthorized (401)`
- `rate_limited (429)`
- `not_found (404)`

Все ошибки должны рендериться через стандартизированный `ErrorSurface` с:
- кодом/типом ошибки,
- коротким объяснением,
- CTA (`retry`, `re-auth`, `open permissions help`).

## 6. Permission-aware UI

### 6.1 Принцип

- Авторизация и проверка прав всегда сервер-сайд.
- Клиент использует `permissions` только для UX-управления видимостью/доступностью.

### 6.2 Обязательные компоненты

- `PermissionGate`: скрыть/задизейблить control.
- `RolePill`: текущая роль.
- `RestrictionHint`: объяснение причины блокировки действия.
- `PolicyImpactPreview`: для admin-форм (роли, лимиты, инцидент-режим).

## 7. Каталог компонентных наборов

### 7.1 Chat Kit

- `ChatLayout`, `MessageFeed`, `MessageBubble`, `Composer`, `TypingIndicator`.
- `ReactionBar`, `ReplyPreview`, `PinnedBanner`, `ThreadChip`.
- `IdentitySwitcher` (`as_user`, `as_group`, `as_role_profile`).
- `MessageMeta` (edited/deleted/encrypted/ttl/scheduled).

### 7.2 Moderation Kit

- `MemberList`, `MemberCard`, `ModerationActionMenu`.
- `MuteTimeoutDialog`, `BanDialog`, `KickDialog`, `CaseLogPanel`.
- `ViolationBadge`, `AutoSanctionTimeline`.

### 7.3 Admin Kit

- `RoleMatrix`, `PermissionMatrix`, `LimitEditor`, `JoinPolicyEditor`.
- `InviteManager`, `JoinRequestQueue`, `WebhookManager`.
- `AuditViewer`, `ExportPanel`, `ChannelNotifyConfig`.

### 7.4 Productivity Kit

- `DraftPanel`, `ScheduledQueue`, `BookmarkCollections`.
- `ReminderSheet`, `UnreadSummaryCard`, `ReadReceiptPolicyPanel`.
- `KeywordAlertManager`, `SubscriptionPanel`, `TranslationToggle`.
- `KnowledgeEditor`, `PollBuilder`, `TicketBoard`.

### 7.5 Broadcast/Automation Kit

- `BroadcastWizard`, `BroadcastStateTimeline`, `DeliveryProgress`.
- `AutomationRuleBuilder`, `ExecutionLogTable`.
- `IncidentModeSwitch`, `IncidentPolicyDiff`, `RollbackTimer`.

## 8. Матрица покрытия функций (все функции)

| Функция | API/WS контракт | UI-модули дизайн-системы |
|---|---|---|
| Auth + bootstrap | `POST /auth/telegram`, `GET /chats/:chatId/bootstrap`, `chat.join`, `chat.snapshot` | `AuthBootstrapBoundary`, `SessionState`, `ChatLayout` |
| Сообщения send/edit/delete | `/messages`, WS `message.created/updated/deleted` | `Composer`, `MessageBubble`, `OptimisticState` |
| Реакции | `/messages/:id/reactions`, WS `message.reaction.updated` | `ReactionBar`, `ReactionPicker` |
| Typing | WS `typing.start/stop` | `TypingIndicator` |
| Публикация as_group/as_role_profile | `/identities`, `sender_mode` в `/messages` | `IdentitySwitcher`, `SignatureModeControl` |
| Режимы комнаты | `chat.mode` | `ModeBadge`, `ComposerGuard` |
| Поиск / pinned / saved views | `/messages/search`, `/messages/pinned`, `/saved-views` | `SearchBar`, `FilterChips`, `PinnedPanel`, `SavedViewManager` |
| Лимиты / slowmode / timeout | `/limits`, `/members/:id/mute|timeout` | `LimitHint`, `CooldownTimer`, `LimitEditor` |
| Модерация участников | `/members`, `/kick|ban|unban|unmute` | `MemberList`, `ModerationActionMenu`, `ModerationDialogs` |
| Роли и права | `/roles`, `permissions/grant|revoke`, `assign|unassign` | `RoleMatrix`, `PermissionMatrix`, `RoleAssignPanel` |
| Симуляция пермишенов | `/roles/permissions/simulate` | `PermissionSimulationPanel` |
| Инвайты и join approval | `/invites*`, `/join-requests*`, `/join-policy*` | `InviteManager`, `JoinRequestQueue`, `JoinPolicyEditor` |
| Channel notify | `/channel-notify/config`, `/channel-notify/test` | `ChannelNotifyConfig`, `TemplatePreview` |
| Broadcast кампании | `/broadcasts*`, WS `broadcast.state.changed`, `broadcast.delivery.progress` | `BroadcastWizard`, `CampaignTable`, `DeliveryProgress` |
| Webhooks | `/webhooks*` | `WebhookManager`, `SecretRotateDialog` |
| Экспорт истории | `/export/history` | `ExportPanel`, `ExportFilterForm` |
| Scheduled messages | `/messages/scheduled*` | `ScheduledQueue`, `ScheduleDialog` |
| Drafts | `/drafts*` | `DraftPanel`, `DraftAutosaveBadge` |
| Bookmarks | `/bookmarks*` | `BookmarkButton`, `BookmarkCollections` |
| Reminders | `/reminders*` | `ReminderSheet`, `ReminderList` |
| Unread summary | `/unread-summary` | `UnreadSummaryCard`, `SummaryFilter` |
| Read receipts + privacy | `/read-receipts*` | `ReadReceiptPanel`, `PrivacyModeSelector` |
| Thread subscriptions | `/thread-subscriptions*`, WS `thread.subscription.triggered` | `ThreadSubscribeToggle`, `ThreadAlertToast` |
| Keyword alerts | `/alerts/keywords*` | `KeywordAlertManager` |
| Polls / quizzes | `/polls*` | `PollBuilder`, `PollCard`, `PollResults` |
| Knowledge base | `/knowledge/articles*` | `KnowledgeEditor`, `ArticleStatusStepper`, `ArticleList` |
| Translations | `/translations*` + toggle на message | `TranslationToggle`, `TranslatedMessageView` |
| Member tags / profile fields | `/members/:id/tags`, `/member-profile-fields*` | `MemberTagEditor`, `ProfileFieldSchemaEditor` |
| Tickets + SLA | `/tickets*`, WS `ticket.updated` | `TicketBoard`, `TicketDetailsDrawer`, `SlaBadge` |
| Automation rules + executions | `/automation/rules*`, `/execute`, `/executions`, WS `automation.rule.executed` | `AutomationRuleBuilder`, `ExecutionLogTable` |
| Temp rooms | `/temp-rooms*` | `TempRoomCreator`, `RoomLifecycleTimeline` |
| Reputation | `/reputation*`, WS `reputation.updated` | `ReputationBadge`, `ReputationHistoryPanel` |
| Incident mode | `/incident-mode/enable|disable`, WS `incident_mode.changed` | `IncidentModeSwitch`, `IncidentPolicyDiff`, `RollbackTimer` |
| E2E devices / encrypted messages | `/e2e/devices*`, encrypted payload in `/messages` | `E2EDeviceManager`, `EncryptedMessageBadge`, `EditRestrictionHint` |
| Audit | `/audit*` (где доступно) | `AuditViewer`, `ActionTracePanel` |

## 9. Информационная архитектура экранов

- `/chat/:chatId`
- `/chat/:chatId/search`
- `/chat/:chatId/pinned`
- `/chat/:chatId/drafts`
- `/chat/:chatId/bookmarks`
- `/chat/:chatId/reminders`
- `/chat/:chatId/admin/roles`
- `/chat/:chatId/admin/limits`
- `/chat/:chatId/admin/members`
- `/chat/:chatId/admin/invites`
- `/chat/:chatId/admin/broadcasts`
- `/chat/:chatId/admin/webhooks`
- `/chat/:chatId/admin/automation`
- `/chat/:chatId/admin/tickets`
- `/chat/:chatId/admin/incident`
- `/chat/:chatId/admin/audit`

Правило: все admin-страницы строятся на едином `AdminPageScaffold`.

## 10. Контракты состояния и data-model фронта

### 10.1 Нормализованные сущности

- `session`, `chat`, `member`, `roles`, `permissions`
- `messages`, `reactions`, `typing`
- `drafts`, `scheduledMessages`, `bookmarks`, `reminders`
- `polls`, `knowledgeArticles`, `tickets`, `automationRules`
- `broadcastCampaigns`, `deliveries`
- `incidentMode`, `auditEntries`

### 10.2 Синхронизация

- REST для CRUD и bootstrap.
- WS для realtime-fanout.
- Optimistic update только для безопасных операций (`send`, `reaction`, локальный draft).
- Reconciliation: серверный payload всегда приоритетен над локальным optimistic state.

## 11. UX-правила для критических сценариев

- `429`: обязательный UI с оставшимся cooldown (если есть данные).
- `muted/readonly/banned`: composer блокируется, показывается причина и время снятия.
- `as_group` при отсутствии прав: явный `RestrictionHint` до отправки.
- Encrypted message: запрет edit в UI + визуальный badge шифрования.
- Incident mode active: глобальный `SystemBanner` на всех экранах чата.

## 12. Доступность и локализация

- Keyboard/focus-visible для всех интерактивных элементов.
- aria-label/aria-live для feed и typing/status сообщений.
- Поддержка RU/EN локали через словари.
- Форматы даты/времени и timezone-aware отображение для scheduled/broadcast/SLA.

## 13. Нефункциональные требования для фронта

- TTI P0 экрана чата: <= 2.5с в типичном мобильном webview.
- Переключение между `feed`/`admin` разделами без полного reload.
- Восстановление после WS-disconnect с авто-reconnect и статус-индикатором.
- Устойчивость к частичным деградациям API (graceful fallback блоков).

## 14. Тестирование дизайн-системы

### 14.1 Обязательно

- Unit тесты для token mapping и базовых компонентов.
- Contract tests для API adapters (P0/P1/P2).
- Storybook visual states: loading/empty/error/forbidden/rate-limited.
- E2E матрица минимум по `docs/FRONTEND_INTEGRATION_HANDOFF.md` (P0 обязательно).

### 14.2 Smoke перед релизом фронта

- `pnpm --filter @phantom-lab/api build`
- `pnpm --filter @phantom-lab/api test`
- `pnpm --filter @phantom-lab/api smoke:hardening`
- `pnpm --filter @phantom-lab/api smoke:frontend-p0`
- `pnpm --filter @phantom-lab/web build`

## 15. План внедрения дизайн-системы

1. Foundation + Primitives + P0 Chat Kit.
2. Productivity Kit (P1).
3. Admin Kit + Broadcast/Automation Kit (P2).
4. Полировка: accessibility, visual regression, perf-budget.

## 16. Критерии приемки

1. Все функции из раздела 8 покрыты UI-компонентами и экранными паттернами.
2. Каждый permission-restricted action имеет предиктивный UI-фидбек до серверного ответа.
3. Все глобальные состояния из раздела 5 реализованы единообразно.
4. P0 E2E-сценарии проходят без ручных обходов.
5. Frontend не допускает silent-failure при WS/API ошибках.
6. Incident, moderation, limits и broadcast сценарии имеют отдельные визуальные маркеры риска.
