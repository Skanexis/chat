# Техническое задание
## Проект: Telegram Mini App "Отдельный Live-чат с расширенным администрированием"

**Версия:** 1.1  
**Дата:** 23 апреля 2026  
**Статус:** Draft for implementation

---

## 1. Цель и контекст

Создать отдельный чат как Telegram Mini App, открываемый из канала/бота, с real-time коммуникацией и управлением уровня enterprise:

- гибкая ролевая модель (RBAC + policy overrides),
- тонкая настройка прав и лимитов,
- расширенная модерация,
- кастомизация UX/логики по ролям и сегментам,
- уведомления о новых сообщениях в Telegram-канал.

Проект должен обеспечивать высокую скорость доставки сообщений, отказоустойчивость и возможность масштабирования.

---

## 2. Ключевые ограничения Telegram (актуально на 23.04.2026)

1. Mini App в канале безопаснее открывать через URL/deep link (`https://t.me/<bot>/<app>?startapp=...`).
2. `InlineKeyboardButton.web_app` имеет ограничения по контексту использования (приватный чат user↔bot).
3. Следовательно, "основной чат" реализуется в вашем backend, а Telegram используется как:
   - точка входа,
   - уведомления/дистрибуция,
   - идентификация пользователя через `initData`.

---

## 3. Scope

### 3.1 In Scope (MVP+)

- Live-чат в Mini App (WebSocket).
- Роли, права, лимиты, таймеры, дефолтная роль.
- Модерация (mute/ban/delete/warn).
- Режимы "чат", "канал", "гибрид".
- Оповещения в Telegram-канал о новых сообщениях.
- Админ-панель с матрицей прав.
- Аудит-лог действий.
- Гибкая конфигурация правил сообщений.

### 3.2 Out of Scope (этап 2+)

- E2E-шифрование прикладного уровня.
- Видео-стриминг/голосовые комнаты.
- Встроенные платежные сценарии.

---

## 4. Роли и модель доступа

### 4.1 Системные роли (базовые)

- `owner`
- `super_admin`
- `admin`
- `moderator`
- `trusted_member`
- `member`
- `newbie`
- `readonly`
- `muted`
- `banned` (статус, не обычная роль)

### 4.2 Кастомные роли

- Неограниченное количество кастомных ролей на чат.
- Наследование от базовой роли.
- Приоритет применения правил.
- Возможность временной роли (с TTL).

### 4.3 Дефолтная роль

- Назначается при первом входе.
- Можно выбрать отдельную роль для:
  - новых пользователей,
  - приглашенных по инвайт-ссылке,
  - пользователей после одобрения модератором.

---

## 5. Матрица прав (расширенная)

Ниже canonical permission keys для backend-проверок.

### 5.1 Доступ и участники

- `chat.view`
- `chat.join`
- `chat.leave`
- `chat.invite.create`
- `chat.invite.revoke`
- `chat.invite.use_unlimited`
- `member.view_list`
- `member.approve_join`
- `member.reject_join`
- `member.kick`
- `member.ban`
- `member.unban`
- `member.mute`
- `member.unmute`
- `member.timeout.set`
- `member.timeout.clear`

### 5.2 Сообщения: базовые

- `message.send.text`
- `message.send.media.image`
- `message.send.media.video`
- `message.send.media.audio`
- `message.send.media.file`
- `message.send.voice`
- `message.send.sticker`
- `message.send.poll`
- `message.send.link`
- `message.send.reply`
- `message.send.forward`
- `message.send.mention_all`
- `message.send.markdown`
- `message.send.html`
- `message.send.as_group`
- `message.send.as_group.signature.hide`
- `message.send.as_group.signature.custom`
- `message.send.as_group.profile.select`

### 5.3 Сообщения: управление

- `message.edit.own`
- `message.edit.any`
- `message.delete.own`
- `message.delete.any`
- `message.pin`
- `message.unpin`
- `message.react`
- `message.react.custom`
- `message.report`
- `message.translate`
- `message.quote`
- `message.copy_protected_bypass`

### 5.4 Контент-политики

- `content.link.allow_external`
- `content.link.allow_whitelist_only`
- `content.media.nsfw_bypass`
- `content.keyword.bypass`
- `content.length.bypass`
- `content.rate_limit.bypass`
- `content.flood_bypass`
- `content.caps_bypass`
- `content.duplicate_bypass`

### 5.5 Модерация

- `moderation.warn.issue`
- `moderation.warn.clear`
- `moderation.note.private_add`
- `moderation.note.private_view`
- `moderation.strike.add`
- `moderation.strike.remove`
- `moderation.case.view`
- `moderation.case.close`
- `moderation.appeal.review`
- `moderation.shadowban.set`
- `moderation.shadowban.clear`

### 5.6 Роли и права

- `role.create`
- `role.update`
- `role.delete`
- `role.assign`
- `role.unassign`
- `role.priority.manage`
- `permission.grant`
- `permission.revoke`
- `permission.override.user`
- `permission.override.clear`

### 5.7 Лимиты и таймеры

- `limit.view`
- `limit.update.role`
- `limit.update.user`
- `limit.reset.user`
- `slowmode.view`
- `slowmode.update`
- `ttl.view`
- `ttl.update`
- `schedule.message.create`
- `schedule.message.cancel`
- `schedule.rule.create`
- `schedule.rule.update`
- `schedule.rule.delete`

### 5.8 Канал/интеграции

- `channel.notify.enable`
- `channel.notify.disable`
- `channel.notify.template.edit`
- `channel.notify.frequency.edit`
- `broadcast.create`
- `broadcast.update`
- `broadcast.delete`
- `broadcast.approve`
- `broadcast.publish.now`
- `broadcast.schedule`
- `broadcast.pause`
- `broadcast.resume`
- `broadcast.cancel`
- `broadcast.audience.manage`
- `broadcast.template.manage`
- `broadcast.stats.view`
- `broadcast.rate_limit.bypass`
- `integration.webhook.create`
- `integration.webhook.rotate_secret`
- `integration.webhook.disable`

### 5.9 Безопасность и аудит

- `security.view_sessions`
- `security.revoke_sessions`
- `security.require_2fa_admin`
- `audit.view`
- `audit.export`
- `audit.immutable_lock`

### 5.10 UI/кастомизация

- `ui.theme.edit`
- `ui.branding.edit`
- `ui.layout.edit`
- `ui.widgets.manage`
- `ui.localization.manage`
- `ui.announcement.manage`

### 5.11 Аналитика

- `analytics.view_realtime`
- `analytics.view_engagement`
- `analytics.view_retention`
- `analytics.export`

### 5.12 Дополнительные product/admin permissions

- `draft.create`
- `draft.update`
- `draft.delete`
- `draft.schedule_send`
- `bookmark.create`
- `bookmark.collection.manage`
- `reminder.create`
- `reminder.manage.own`
- `summary.unread.generate`
- `summary.unread.configure`
- `read_receipt.view.own`
- `read_receipt.view.any`
- `read_receipt.privacy.manage`
- `alert.keyword.create`
- `alert.keyword.delete`
- `poll.quiz.create`
- `poll.quiz.close`
- `poll.quiz.results.view`
- `knowledge.article.create`
- `knowledge.article.update`
- `knowledge.article.publish`
- `knowledge.article.archive`
- `translation.use`
- `translation.manage`
- `member.tag.create`
- `member.tag.assign`
- `member.profile_fields.manage`
- `ticket.create`
- `ticket.assign`
- `ticket.close`
- `ticket.sla.manage`
- `automation.rule.create`
- `automation.rule.update`
- `automation.rule.delete`
- `automation.rule.execute`
- `room.temp.create`
- `room.temp.archive`
- `room.temp.restore`
- `reputation.view`
- `reputation.adjust`
- `reputation.auto_rule.manage`
- `focus_mode.configure`
- `focus_mode.override`
- `incident_mode.enable`
- `incident_mode.disable`
- `incident_mode.policy.edit`

---

## 6. Правила разрешений (Policy Engine)

### 6.1 Приоритеты

1. Global hard deny (системный запрет)
2. User-level explicit deny
3. User-level explicit allow
4. Role-level deny
5. Role-level allow
6. Default deny

### 6.2 Контекстные условия (ABAC поверх RBAC)

Политика может учитывать:

- время суток/день недели,
- тип клиента,
- возраст аккаунта в чате,
- подтверждение профиля,
- состояние предупреждений/страйков,
- наличие активного mute/timeout,
- "режим события" (например, трансляция/анонс).

### 6.3 Временные права

- Выдача на интервал (`valid_from`, `valid_until`).
- Auto revoke по таймеру.

---

## 7. Функционал чата (расширенный)

### 7.1 Сообщения

- Текст, медиа, ссылки, опросы, системные сообщения.
- Reply/thread (уровень 1 для MVP, многоуровневые в v2).
- Редактирование с историей версий (для модераторов).
- Удаление (soft delete + reason code).
- Реакции (включая кастомные наборы по роли).
- Публикация от имени группы/комнаты (если есть соответствующее право).

### 7.2 Режимы комнаты

- `chat_mode`: все с правом могут писать.
- `channel_mode`: пишут только роли с publish-пермом.
- `hybrid_mode`: по расписанию/событию переключаемый режим.

### 7.3 Таймеры

- Slow mode по роли.
- Cooldown per user.
- TTL сообщений (глобально, по роли, по тегу).
- Scheduled messages.
- Quiet hours (окна тишины).

### 7.4 Лимиты

- `messages_per_day`
- `messages_per_hour`
- `media_per_day`
- `links_per_day`
- `mentions_per_day`
- burst limit (N сообщений за M секунд)
- auto-action при превышении: warn/mute/reject.

### 7.5 Модерация и безопасность

- Антифлуд (token bucket + duplicate detector).
- Антиспам ссылок (allowlist/denylist domains).
- Keyword-фильтры (regex/словари).
- NSFW-пайплайн (опционально флаг).
- Жалобы на сообщения.
- Модерация очереди (pre-moderation mode).

### 7.6 Поиск и навигация

- Поиск по тексту/автору/диапазону дат/тегам.
- Фильтр по типу контента.
- Закрепленные объявления.
- Saved views (пресеты фильтров).

### 7.7 Уведомления

- In-app нотификации.
- Telegram канал-уведомления:
  - instant,
  - batched digest (каждые N минут),
  - quiet-hours-aware.
- Настраиваемые шаблоны сообщений уведомлений.
- Автоматические broadcast-рассылки по расписанию и триггерам.

### 7.8 Кастомизации

- Тема: цвета, шрифты, радиусы, плотность.
- Брендинг: лого, обложка, welcome card.
- Layout-переключатели: compact/cozy, bubble/classic.
- Feature toggles на уровне чата/роли.
- Onboarding-конструктор (правила/FAQ/кнопки).
- Кастомные quick-actions модераторов.

### 7.9 Расширения

- Webhook на события (`message.created`, `member.banned`, ...).
- Внешние интеграции (CRM, anti-abuse, BI).
- Экспорт истории (JSONL/CSV с policy constraints).

### 7.10 Публикация от имени группы

- Администратор может отправлять сообщения не от личного профиля, а от "групповой сущности" чата.
- Режимы отправки:
  - `as_user` (обычно),
  - `as_group` (бренд/название комнаты),
  - `as_role_profile` (например, "Moderation Team", "News Desk").
- Поддержка настраиваемой подписи:
  - скрытая подпись,
  - системная подпись ("Опубликовано администратором"),
  - кастомная подпись (по policy).
- Для каждого сообщения сохраняется реальный `actor_id` в аудит, даже если внешне автором показана группа.
- Политики безопасности:
  - только whitelist ролей может использовать `as_group`,
  - опциональный dual-approval для публикации от имени группы в `channel_mode`,
  - отдельные лимиты на сообщения `as_group`.

### 7.11 Автоматические broadcast-кампании

- Типы broadcast:
  - `scheduled` (по времени),
  - `recurring` (cron/календарь),
  - `event_triggered` (по событию),
  - `digest` (сводка за период).
- Таргетинг аудитории:
  - по ролям,
  - по статусам (`active`, `newbie`, `muted_readonly`),
  - по активности (например, не писал 7 дней),
  - по языку/локали.
- Контент broadcast:
  - текст, медиа, кнопки deep link, CTA.
  - переменные шаблонов (`{first_name}`, `{chat_name}`, `{unread_count}` и др.).
- Контроль доставки:
  - rate limit на кампанию,
  - throttle по сегментам,
  - retry policy + dead-letter.
- Workflow:
  - draft -> review -> approved -> scheduled -> running -> completed/canceled.
- Fail-safe:
  - dry-run предпросмотр,
  - тестовая рассылка на internal role,
  - глобальный kill switch рассылок.

### 7.12 Дополнительные функции (15 шт)

1. **Персональные черновики и отложенная отправка (user-first)**
   - Автосохранение текста и вложений в `drafts`.
   - Режим "отправить позже" с локальным и серверным расписанием.
   - Валидация прав при фактической отправке (на момент execution, а не на момент создания черновика).

2. **Закладки сообщений и коллекции**
   - Пользователь может сохранять сообщения в личные/общие коллекции.
   - Поддержка тегов и быстрого фильтра "важное/к ответу/документы".
   - Для общих коллекций нужны права `bookmark.collection.manage`.

3. **Напоминания по сообщениям (follow-up)**
   - Напоминание "вернуться к сообщению" через N минут/часов/дней.
   - Типы: личное, командное (для роли), модераторское.
   - Delivery: in-app + опционально Telegram-уведомление.

4. **Smart Unread Summary**
   - Кнопка "что пропустил" формирует краткую выжимку непрочитанного.
   - Фильтры: только упоминания, только модерация, только анонсы.
   - Поддержка ручного и авто-режима по расписанию.

5. **Гибкие read receipts**
   - Режимы: `off`, `private` (только себе), `role-visible`, `global`.
   - Админ может запретить просмотр read receipts между ролями.
   - Для приватности хранится агрегированная статистика без лишнего раскрытия.

6. **Подписка на треды и keyword-alerts**
   - Пользователь подписывается на конкретный thread/message.
   - Ключевые слова с персональными алертами.
   - Антиспам: сглаживание повторных алертов по одному ключу.

7. **Опросы и квизы**
   - Типы: одиночный выбор, множественный, квиз с правильным ответом.
   - Параметры: анонимность, авто-закрытие, ограничение по роли.
   - Админ видит расширенную статистику и экспорт результатов.

8. **Knowledge Base / Wiki внутри чата**
   - Статьи с версиями, статусами (`draft/review/published/archived`) и категориями.
   - Быстрые ссылки из сообщений и закрепов.
   - Права на публикацию/архивацию разделены.

9. **Перевод сообщений в реальном времени**
   - Пользователь выбирает preferred language.
   - Сообщения показываются с переключением оригинал/перевод.
   - Кэш переводов, лимиты на автоперевод для снижения стоимости.

10. **Карточки участников и теги (mini CRM)**
    - Кастомные поля профиля (например, департамент, город, timezone).
    - Теги участников (`vip`, `newbie-risk`, `partner`) для модерации и broadcast-сегментации.
    - История изменений карточки фиксируется в аудите.

11. **Тикеты из сообщений**
    - Любое сообщение можно конвертировать в тикет.
    - Поля тикета: приоритет, исполнитель, SLA, статус.
    - Workflow: `open -> in_progress -> waiting -> resolved -> closed`.

12. **No-code автоматизации (rules engine)**
    - Конструктор: `trigger -> conditions -> actions`.
    - Примеры триггеров: new message, limit hit, new member, ticket overdue.
    - Примеры actions: выдать роль, отправить шаблон, создать тикет, включить slowmode.

13. **Временные комнаты / event channels**
    - Создание временной комнаты под событие с автоархивацией.
    - Наследование прав из родительского чата + локальные overrides.
    - После окончания комнаты: read-only archive и экспорт.

14. **Репутация и достижения**
    - Баллы за полезные действия (ответы, помощь, подтвержденные решения).
    - Админские корректировки и авто-правила повышения/понижения.
    - Опциональный автопромоут роли при достижении порога.

15. **Incident Mode (экстренный режим)**
    - Один переключатель для кризисных случаев.
    - Действия профиля: блок новых медиа/ссылок, включение pre-moderation, ужесточение лимитов.
    - Публичный баннер о временных ограничениях + auto rollback по таймеру.

---

## 8. Telegram Bot + Mini App сценарий

### 8.1 Поток входа

1. Бот публикует пост в канале.
2. В посте кнопка `Открыть чат` с URL deep link на Mini App.
3. Пользователь открывает Mini App.
4. Frontend передает `initData` в backend.
5. Backend валидирует подпись, создает session/JWT.
6. Клиент подключается к WS и получает данные комнаты.

### 8.2 Поток нового сообщения

1. Пользователь отправляет сообщение через API/WS.
2. Сервер считает effective permissions.
3. Проверяются лимиты/таймеры/антиспам.
4. Сообщение сохраняется в PostgreSQL.
5. Событие публикуется в Redis pub/sub.
6. WS-gateway пушит всем подключенным клиентам.
7. Notification service отправляет уведомление в канал по шаблону.

### 8.3 Поток сообщения "от имени группы"

1. Администратор выбирает режим `as_group` в UI composer.
2. API проверяет `message.send.as_group` и дополнительные policy-условия.
3. Сервер сохраняет:
   - `display_author_type = group`,
   - `display_author_id = group_profile_id`,
   - `actor_user_id = real_admin_id`.
4. Сообщение доставляется в realtime-поток как групповое.
5. В аудит пишется полная трассировка "кто реально отправил".

### 8.4 Поток автоматического broadcast

1. Админ создает кампанию (`draft`) и выбирает аудиторию/расписание.
2. При необходимости кампания проходит `approve`.
3. Scheduler активирует кампанию в нужное время.
4. Broadcast worker формирует батчи, соблюдает лимиты и quiet hours.
5. Сервис отправляет сообщения в чат/канал/внутренние нотификации.
6. Метрики доставки и ошибки фиксируются в статистике кампании.

---

## 9. Архитектура (рекомендуемая)

### 9.1 Стек

- **Frontend Mini App:** Next.js (App Router), React, TypeScript, Telegram WebApp SDK.
- **Backend API:** NestJS + Fastify.
- **Realtime:** Socket.IO (или ws) + Redis adapter.
- **DB:** PostgreSQL.
- **Кэш/лимиты/pubsub:** Redis.
- **Очереди/таймеры:** BullMQ.
- **Bot service:** grammY (webhook mode).
- **ORM:** Prisma.
- **Observability:** OpenTelemetry + Prometheus + Grafana + Sentry.
- **Infra:** Docker, Nginx, Kubernetes (или VM для MVP).

### 9.2 Сервисы

- `api-gateway`
- `auth-service`
- `chat-service`
- `policy-service`
- `moderation-service`
- `notification-service`
- `bot-service`
- `scheduler-service`
- `broadcast-service`
- `ticket-service`
- `automation-service`
- `knowledge-service`
- `audit-service`

---

## 10. Модель данных (логическая)

### 10.1 Основные таблицы

- `users`
- `chats`
- `chat_members`
- `chat_identities`
- `roles`
- `role_permissions`
- `user_permission_overrides`
- `role_limits`
- `user_limits`
- `messages`
- `message_versions`
- `message_reactions`
- `broadcast_campaigns`
- `broadcast_recipients`
- `broadcast_deliveries`
- `broadcast_templates`
- `user_drafts`
- `message_bookmarks`
- `bookmark_collections`
- `user_reminders`
- `read_receipts`
- `keyword_alerts`
- `polls`
- `poll_votes`
- `knowledge_articles`
- `member_tags`
- `member_profile_fields`
- `tickets`
- `ticket_events`
- `automation_rules`
- `automation_executions`
- `temp_rooms`
- `reputation_events`
- `incident_mode_logs`
- `moderation_cases`
- `moderation_actions`
- `invites`
- `schedules`
- `webhooks`
- `audit_logs`
- `channel_notifications`

### 10.2 Ключевые поля (пример)

`roles`:
- `id`, `chat_id`, `name`, `priority`, `is_system`, `is_default`, `created_at`

`chat_members`:
- `id`, `chat_id`, `user_id`, `role_id`, `status`, `joined_at`, `muted_until`, `banned_until`

`role_limits`:
- `role_id`, `messages_per_day`, `messages_per_hour`, `links_per_day`, `media_per_day`, `slowmode_seconds`, `burst_size`, `burst_window_seconds`

`messages`:
- `id`, `chat_id`, `author_id`, `display_author_type`, `display_author_id`, `actor_user_id`, `type`, `text`, `meta_json`, `reply_to_id`, `is_deleted`, `delete_reason`, `ttl_expires_at`, `created_at`

`chat_identities`:
- `id`, `chat_id`, `name`, `avatar_url`, `type`, `is_active`, `created_by`, `created_at`

`broadcast_campaigns`:
- `id`, `chat_id`, `name`, `status`, `broadcast_type`, `audience_json`, `content_json`, `schedule_expr`, `timezone`, `quiet_hours_policy`, `created_by`, `approved_by`, `created_at`

`broadcast_deliveries`:
- `id`, `campaign_id`, `recipient_id`, `status`, `attempt`, `error_code`, `delivered_at`

`user_drafts`:
- `id`, `chat_id`, `user_id`, `payload_json`, `scheduled_at`, `status`, `created_at`, `updated_at`

`tickets`:
- `id`, `chat_id`, `source_message_id`, `status`, `priority`, `assignee_id`, `sla_due_at`, `created_by`, `created_at`

`automation_rules`:
- `id`, `chat_id`, `name`, `trigger_type`, `conditions_json`, `actions_json`, `is_enabled`, `created_by`, `updated_at`

`reputation_events`:
- `id`, `chat_id`, `user_id`, `delta`, `reason`, `source_type`, `source_id`, `actor_id`, `created_at`

`incident_mode_logs`:
- `id`, `chat_id`, `enabled_by`, `enabled_at`, `disabled_at`, `policy_snapshot_json`, `reason`

`audit_logs`:
- `id`, `chat_id`, `actor_id`, `action`, `target_type`, `target_id`, `payload_json`, `ip`, `created_at`

---

## 11. API контракты (пример)

### 11.1 Auth

- `POST /v1/auth/telegram`
  - body: `{ initData: string }`
  - response: `{ accessToken, refreshToken, user, memberships[] }`

### 11.2 Chat

- `GET /v1/chats/:chatId`
- `GET /v1/chats/:chatId/messages?cursor=...`
- `POST /v1/chats/:chatId/messages`
- `PATCH /v1/chats/:chatId/messages/:messageId`
- `DELETE /v1/chats/:chatId/messages/:messageId`
- `GET /v1/chats/:chatId/identities`
- `POST /v1/chats/:chatId/identities`
- `PATCH /v1/chats/:chatId/identities/:identityId`

`POST /v1/chats/:chatId/messages` (важные поля body):
- `text?: string`
- `media?: { type: "image" | "video" | "audio" | "file", url: string }`
- `sender_mode: "as_user" | "as_group" | "as_role_profile"`
- `identity_id?: string` (обязателен для `as_group`/`as_role_profile`)
- `signature_mode?: "system" | "hidden" | "custom"`
- `custom_signature?: string`
- `reply_to_id?: string`

### 11.3 Roles/Permissions

- `GET /v1/chats/:chatId/roles`
- `POST /v1/chats/:chatId/roles`
- `PATCH /v1/chats/:chatId/roles/:roleId`
- `POST /v1/chats/:chatId/roles/:roleId/permissions:grant`
- `POST /v1/chats/:chatId/roles/:roleId/permissions:revoke`

### 11.4 Limits/Timers

- `GET /v1/chats/:chatId/limits`
- `PATCH /v1/chats/:chatId/limits/roles/:roleId`
- `POST /v1/chats/:chatId/members/:userId/mute`
- `POST /v1/chats/:chatId/members/:userId/timeout`

### 11.5 Notifications

- `PATCH /v1/chats/:chatId/channel-notify/config`
- `POST /v1/chats/:chatId/channel-notify/test`

### 11.6 Broadcasts

- `GET /v1/chats/:chatId/broadcasts`
- `POST /v1/chats/:chatId/broadcasts`
- `PATCH /v1/chats/:chatId/broadcasts/:campaignId`
- `POST /v1/chats/:chatId/broadcasts/:campaignId/approve`
- `POST /v1/chats/:chatId/broadcasts/:campaignId/schedule`
- `POST /v1/chats/:chatId/broadcasts/:campaignId/publish-now`
- `POST /v1/chats/:chatId/broadcasts/:campaignId/pause`
- `POST /v1/chats/:chatId/broadcasts/:campaignId/resume`
- `POST /v1/chats/:chatId/broadcasts/:campaignId/cancel`
- `GET /v1/chats/:chatId/broadcasts/:campaignId/stats`

`POST /v1/chats/:chatId/broadcasts` (важные поля body):
- `name: string`
- `broadcast_type: "scheduled" | "recurring" | "event_triggered" | "digest"`
- `audience: { roles?: string[], statuses?: string[], inactive_days_gte?: number, locale?: string[] }`
- `content: { text?: string, media?: any, buttons?: any[], template_id?: string }`
- `schedule: { at?: string, cron?: string, timezone: string }`
- `sender_mode: "as_user" | "as_group" | "as_role_profile"`
- `identity_id?: string`
- `requires_approval?: boolean`
- `rate_limit_per_minute?: number`

### 11.7 Productivity/Admin Advanced

- `POST /v1/chats/:chatId/drafts`
- `GET /v1/chats/:chatId/drafts`
- `DELETE /v1/chats/:chatId/drafts/:draftId`
- `POST /v1/chats/:chatId/bookmarks`
- `GET /v1/chats/:chatId/bookmarks`
- `POST /v1/chats/:chatId/reminders`
- `GET /v1/chats/:chatId/unread-summary`
- `POST /v1/chats/:chatId/alerts/keywords`
- `POST /v1/chats/:chatId/polls`
- `POST /v1/chats/:chatId/polls/:pollId/vote`
- `POST /v1/chats/:chatId/knowledge/articles`
- `PATCH /v1/chats/:chatId/knowledge/articles/:articleId`
- `POST /v1/chats/:chatId/members/:userId/tags`
- `POST /v1/chats/:chatId/tickets`
- `PATCH /v1/chats/:chatId/tickets/:ticketId`
- `POST /v1/chats/:chatId/automation/rules`
- `PATCH /v1/chats/:chatId/automation/rules/:ruleId`
- `POST /v1/chats/:chatId/temp-rooms`
- `POST /v1/chats/:chatId/reputation/adjust`
- `POST /v1/chats/:chatId/incident-mode/enable`
- `POST /v1/chats/:chatId/incident-mode/disable`

`POST /v1/chats/:chatId/automation/rules` (body):
- `name: string`
- `trigger: "message.created" | "member.joined" | "ticket.overdue" | "limit.hit"`
- `conditions: any[]`
- `actions: any[]`
- `is_enabled: boolean`

`POST /v1/chats/:chatId/tickets` (body):
- `source_message_id: string`
- `priority: "low" | "normal" | "high" | "urgent"`
- `assignee_id?: string`
- `sla_due_at?: string`
- `labels?: string[]`

---

## 12. WebSocket события (пример)

### 12.1 Client -> Server

- `chat.join`
- `message.send`
- `message.edit`
- `message.delete`
- `reaction.set`
- `typing.start`
- `typing.stop`
- `broadcast.preview.request`
- `draft.save`
- `draft.schedule`
- `poll.vote`
- `ticket.update`
- `knowledge.article.read`
- `incident_mode.status.request`

### 12.2 Server -> Client

- `chat.snapshot`
- `message.created`
- `message.updated`
- `message.deleted`
- `member.updated`
- `role.updated`
- `limit.hit`
- `moderation.action`
- `system.announcement`
- `broadcast.state.changed`
- `broadcast.delivery.progress`
- `summary.unread.ready`
- `ticket.updated`
- `automation.rule.executed`
- `incident_mode.changed`
- `reputation.updated`
- `poll.closed`

---

## 13. Валидаторы и антиабуз

### 13.1 Валидация входа

- Проверка `initData` подписи.
- TTL для auth payload (например <= 5 минут).
- Защита от replay (nonce/session binding).

### 13.2 Валидация сообщения

- max length по роли,
- проверка запрещенных слов/regex,
- URL parsing + domain policy,
- duplicate/flood check,
- media mime/type policy.
- проверка режима отправки (`as_user` / `as_group`) и identity-level прав.

### 13.4 Валидация broadcast-кампаний

- обязательная проверка audience scope (запрет на недопустимые сегменты),
- ограничение частоты campaign-per-chat,
- контроль quiet hours и blackout windows,
- безопасный рендер шаблонов (escape/placeholder validation),
- защита от повторного запуска кампании по idempotency key.

### 13.5 Валидация расширенных функций

- Для `draft.schedule_send` повторно проверяются permission/limits в момент выполнения.
- Для keyword-alerts действует max-лимит алертов на пользователя и dedup-интервал.
- Для квизов валидируется окно голосования и запрет повторного голоса.
- Для тикетов обязательна проверка переходов статусов (state machine guardrails).
- Для automation rules выполняется static safety-check (нет рекурсивных/циклических действий).
- Для incident mode фиксируется `policy_snapshot_json` и причина включения.

### 13.3 Авто-санкции

- 1-е нарушение: warning
- 2-е: short mute
- 3-е: long mute
- 4-е: ban/manual review

Порог и шаги полностью настраиваемые.

---

## 14. Нефункциональные требования

### 14.1 Производительность

- P95 send->deliver: до 300 мс (single region).
- P99 API latency: до 700 мс.
- Поддержка 20k concurrent WS (этап 1 scale target).

### 14.2 Надежность

- SLA: 99.9%.
- Без потери подтвержденных сообщений при рестартах.
- Retriable pipeline для уведомлений в канал.

### 14.3 Масштабирование

- Horizontal scale API и WS.
- Redis pub/sub для fanout.
- Очереди на тяжёлые задачи (модерация/уведомления/экспорт).

---

## 15. Безопасность

- TLS везде.
- Секреты только через secret manager.
- Ротация bot token/webhook secret.
- RBAC + immutable audit trail.
- Защита admin endpoints: IP allowlist (опционально), step-up auth.
- Сигнатуры webhook + idempotency keys.

---

## 16. Логи, аудит, аналитика

### 16.1 Логи

- structured JSON logs.
- correlation id на запрос/событие.

### 16.2 Аудит

- Любое админ-действие в `audit_logs`.
- Нельзя физически удалять записи аудита (только архив).

### 16.3 Аналитика

- DAU/WAU/MAU.
- сообщения по ролям.
- % сообщений отклонено политиками.
- среднее время реакции модерации.

---

## 17. UI/UX требования Mini App

- Мобильный first (Telegram in-app webview).
- Плавный real-time feed и optimistic UI.
- Ясные системные статусы: limit hit, mute, role changed.
- Админ-панель:
  - Role editor,
  - Permission matrix,
  - Limits/timers editor,
  - Moderation queue,
  - Audit viewer.

---

## 18. Конфигурации и кастомизации

### 18.1 Глобальные параметры чата

- `default_role_id`
- `chat_mode`
- `message_ttl_default`
- `slowmode_default`
- `link_policy` (`allow_all | whitelist | deny_all`)
- `media_policy`
- `pre_moderation_enabled`
- `channel_notifications_mode` (`off | instant | digest`)
- `digest_interval_minutes`
- `quiet_hours`
- `allow_post_as_group`
- `group_post_requires_approval`
- `group_post_identity_default`
- `broadcasts_enabled`
- `broadcasts_require_approval`
- `broadcast_default_rate_limit`
- `broadcast_quiet_hours_policy`
- `drafts_enabled`
- `draft_send_max_delay_hours`
- `bookmarks_enabled`
- `reminders_enabled`
- `unread_summary_enabled`
- `read_receipts_mode_default`
- `keyword_alerts_enabled`
- `polls_enabled`
- `knowledge_base_enabled`
- `translation_enabled`
- `tickets_enabled`
- `ticket_sla_defaults`
- `automation_rules_enabled`
- `temp_rooms_enabled`
- `reputation_enabled`
- `incident_mode_enabled`
- `incident_mode_auto_rollback_minutes`

### 18.2 Гибкие шаблоны уведомлений

Переменные:

- `{chat_name}`
- `{author_name}`
- `{message_preview}`
- `{message_id}`
- `{open_app_url}`
- `{role}`
- `{timestamp}`

---

## 19. Сценарии использования (основные)

1. **Новый участник**
   - открывает Mini App, получает `default_role`, видит правила.

2. **Роль с лимитом 2/день**
   - 1-2 сообщения проходят,
   - 3-е блокируется с причиной и временем следующего окна.

3. **Mute на 24 часа**
   - отправка блокируется,
   - чтение остается доступным (если роль позволяет).

4. **Режим канала**
   - `member` не может писать,
   - `admin/moderator` публикуют анонсы.

5. **Уведомление в канал**
   - при новом сообщении отправляется пост с кнопкой deep link.

6. **Админ пишет от имени группы**
   - сообщение отображается как от "группы",
   - в аудит-логе остается реальный отправитель-администратор.

7. **Автоматический broadcast**
   - создается recurring-кампания,
   - в заданное время сообщение уходит в целевую аудиторию,
   - статус доставки и ошибки видны в статистике кампании.

8. **Отложенная отправка из черновика**
   - пользователь сохраняет черновик и ставит отправку на 09:00,
   - в момент отправки сервер повторно проверяет лимиты/права,
   - сообщение доставляется или отклоняется с ясной причиной.

9. **Тикет из проблемного сообщения**
   - модератор создает тикет из сообщения участника,
   - назначает исполнителя и SLA,
   - статус меняется до `resolved`, история фиксируется.

10. **No-code автоматизация**
    - создается правило: если новый участник, то выдать роль `newbie` и отправить onboarding,
    - срабатывание правила логируется в `automation_executions`.

11. **Временная комната под событие**
    - админ создает room на 48 часов,
    - после дедлайна room автоархивируется в read-only.

12. **Incident Mode**
    - при спам-атаке админ включает экстренный режим,
    - включается pre-moderation и блок внешних ссылок,
    - по таймеру политика автоматически откатывается.

---

## 20. Критерии приемки (Acceptance Criteria)

1. Новому пользователю всегда назначается дефолтная роль.
2. Матрица прав работает сервер-сайд (обход через клиент невозможен).
3. Лимиты/slowmode/таймеры корректно применяются и логируются.
4. Временные роли и mute автоматически истекают.
5. Уведомления в Telegram-канал отправляются по настроенному режиму.
6. Все модераторские действия попадают в аудит.
7. При сбое downstream сервиса сообщение не теряется (retry/dead-letter).
8. Публикация `as_group` доступна только ролям с соответствующим permission.
9. Для `as_group` в сообщении корректно разделяются `display_author` и реальный `actor`.
10. Broadcast-кампании поддерживают draft/approve/schedule/publish-now/pause/resume/cancel.
11. Broadcast-доставка соблюдает rate limits и quiet hours.
12. Для 15 дополнительных функций доступны отдельные permissions и server-side проверки.
13. Тикеты имеют валидные переходы статусов и SLA-метрики.
14. Automation rules не допускают рекурсивные циклы и фиксируют execution log.
15. Incident Mode атомарно применяет policy snapshot и корректно выполняет rollback.
16. Read receipts и unread summary соблюдают заданный режим приватности.

---

## 21. Тестирование

### 21.1 Unit

- policy resolution
- limit calculators
- flood detectors
- role inheritance

### 21.2 Integration

- auth via initData
- ws delivery
- bot webhook -> notification pipeline
- post-as-group -> audit trace integrity
- broadcast scheduler -> worker -> delivery metrics
- drafts/reminders/bookmarks lifecycle
- tickets workflow + SLA deadlines
- automation engine trigger -> action consistency
- incident mode toggle -> policy propagation

### 21.3 E2E

- вход из deep link,
- отправка/редактирование/удаление сообщений,
- применение mute/ban/role changes,
- режимы чата и лимиты.
- отправка сообщения `as_group` с проверкой прав.
- запуск scheduled broadcast и проверка доставки.
- создание квиза и корректный подсчет голосов.
- создание статьи в knowledge base и публикация по workflow.
- включение incident mode и проверка ограничений/rollback.

### 21.4 Load

- 2k, 5k, 10k, 20k concurrent connections.
- стресс тест burst сообщений.

---

## 22. План внедрения

### Этап 1 (2-4 недели)

- Auth + чат + WS + базовые роли/права + уведомления в канал.

### Этап 2 (3-5 недель)

- Расширенная модерация, лимиты/таймеры, админ-панель, аудит.

### Этап 3 (2-4 недели)

- Кастомизации, webhooks, аналитика, broadcast-кампании, tickets/automation/incident-mode, масштабирование и hardening.

---

## 23. Риски и меры

- **Риск:** всплески нагрузки при массовых уведомлениях.  
  **Мера:** очередь + backpressure + digest mode.

- **Риск:** злоупотребление ссылками/спам.  
  **Мера:** policy engine + доменные списки + авто-санкции.

- **Риск:** ошибки конфигурации прав.  
  **Мера:** permission simulation tool ("проверить как пользователь X").

---

## 24. Рекомендуемые next steps

1. Утвердить список ролей и дефолтных permissions для вашего кейса.
2. Зафиксировать SLA и целевую нагрузку (конкретные цифры).
3. Начать с прототипа: auth + messages + limits + channel notify.
