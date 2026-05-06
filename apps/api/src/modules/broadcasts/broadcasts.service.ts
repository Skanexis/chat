import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { BroadcastCampaignPatch, DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { BroadcastCampaign, ChatMember, RequestUser } from "../../core/types.js";
import { BroadcastQueueService } from "./broadcast-queue.service.js";
import { CreateBroadcastDto, PublishNowDto, ScheduleBroadcastDto, UpdateBroadcastDto } from "./broadcasts.dto.js";
import type { BroadcastJobData, BroadcastJobTrigger } from "./broadcasts.types.js";

@Injectable()
export class BroadcastsService {
  private readonly idempotencyCache = new Map<string, { expiresAt: number; operation: "schedule" | "publish_now" }>();

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly eventBus: EventBusService,
    private readonly queue: BroadcastQueueService,
    private readonly configService: ConfigService
  ) {}

  async listCampaigns(chatId: string, requestUser: RequestUser): Promise<BroadcastCampaign[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "broadcast.stats.view");
    return this.db.listBroadcastCampaigns(chatId);
  }

  async createCampaign(chatId: string, requestUser: RequestUser, dto: CreateBroadcastDto): Promise<BroadcastCampaign> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "broadcast.create");
    await this.assertCampaignCreateRate(chatId, member);
    await this.validateAudienceScope(chatId, dto.audience);
    await this.validateSenderMode(chatId, member, dto.sender_mode, dto.identity_id);
    this.validateContent(dto.content);
    this.validateSchedule(dto.broadcast_type, dto.schedule.at, dto.schedule.cron);
    this.validateTemplateSafety(dto.content);

    const created = await this.db.createBroadcastCampaign({
      chatId,
      name: dto.name,
      broadcastType: dto.broadcast_type,
      audience: dto.audience,
      content: dto.content,
      schedule: dto.schedule,
      senderMode: dto.sender_mode,
      identityId: dto.identity_id ?? null,
      requiresApproval: dto.requires_approval ?? false,
      rateLimitPerMinute: dto.rate_limit_per_minute ?? null,
      status: dto.requires_approval ? "review" : "draft",
      createdBy: requestUser.userId
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "broadcast.create",
      targetType: "broadcast_campaign",
      targetId: created.id,
      payload: dto as unknown as Record<string, unknown>
    });
    this.emitStateChanged(created);
    return created;
  }

  async updateCampaign(chatId: string, campaignId: string, requestUser: RequestUser, dto: UpdateBroadcastDto): Promise<BroadcastCampaign> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "broadcast.update");

    const current = await this.db.getBroadcastCampaign(chatId, campaignId);
    this.assertMutableStatus(current.status);

    if (dto.audience !== undefined) {
      await this.policy.assertCan(chatId, member, "broadcast.audience.manage");
    }
    if (dto.content !== undefined) {
      await this.policy.assertCan(chatId, member, "broadcast.template.manage");
      this.validateContent(dto.content);
      this.validateTemplateSafety(dto.content);
    }
    if (dto.schedule !== undefined) {
      this.validateSchedule(dto.broadcast_type ?? current.broadcastType, dto.schedule.at, dto.schedule.cron);
    }
    if (dto.audience !== undefined) {
      await this.validateAudienceScope(chatId, dto.audience);
    }
    if (dto.sender_mode !== undefined || dto.identity_id !== undefined) {
      await this.validateSenderMode(chatId, member, dto.sender_mode ?? current.senderMode, dto.identity_id ?? current.identityId ?? undefined);
    }

    const relevantFieldsChanged =
      dto.name !== undefined ||
      dto.broadcast_type !== undefined ||
      dto.audience !== undefined ||
      dto.content !== undefined ||
      dto.schedule !== undefined ||
      dto.sender_mode !== undefined ||
      dto.identity_id !== undefined;

    const patch: BroadcastCampaignPatch = {
      name: dto.name,
      broadcastType: dto.broadcast_type,
      audience: dto.audience,
      content: dto.content,
      schedule: dto.schedule,
      senderMode: dto.sender_mode,
      identityId: dto.identity_id,
      requiresApproval: dto.requires_approval,
      rateLimitPerMinute: dto.rate_limit_per_minute
    };

    if ((dto.requires_approval ?? current.requiresApproval) && relevantFieldsChanged) {
      patch.status = "review";
      patch.approvedBy = null;
      patch.approvedAt = null;
    }

    const updated = await this.db.updateBroadcastCampaign(chatId, campaignId, patch);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "broadcast.update",
      targetType: "broadcast_campaign",
      targetId: campaignId,
      payload: dto as unknown as Record<string, unknown>
    });
    this.emitStateChanged(updated);

    const scheduleTouched = dto.schedule !== undefined || dto.broadcast_type !== undefined;
    if (updated.status === "scheduled" && scheduleTouched) {
      await this.queue.enqueueScheduled(updated, this.buildJob(updated, "scheduled", requestUser.userId));
    }

    return updated;
  }

  async approveCampaign(chatId: string, campaignId: string, requestUser: RequestUser): Promise<BroadcastCampaign> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "broadcast.approve");

    const current = await this.db.getBroadcastCampaign(chatId, campaignId);
    this.assertNotFinalStatus(current.status);

    const approved = await this.db.updateBroadcastCampaign(chatId, campaignId, {
      status: "approved",
      approvedBy: requestUser.userId,
      approvedAt: new Date().toISOString()
    });
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "broadcast.approve",
      targetType: "broadcast_campaign",
      targetId: campaignId,
      payload: {}
    });
    this.emitStateChanged(approved);
    return approved;
  }

  async scheduleCampaign(
    chatId: string,
    campaignId: string,
    requestUser: RequestUser,
    dto: ScheduleBroadcastDto
  ): Promise<BroadcastCampaign> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "broadcast.schedule");

    const current = await this.db.getBroadcastCampaign(chatId, campaignId);
    this.assertNotFinalStatus(current.status);
    this.assertApprovalSatisfied(current);
    if (this.isDuplicateIdempotency(chatId, campaignId, "schedule", dto.idempotency_key)) {
      return current;
    }

    const nextSchedule = {
      ...current.schedule,
      at: dto.at ?? current.schedule.at,
      cron: dto.cron ?? current.schedule.cron,
      timezone: dto.timezone ?? current.schedule.timezone
    };
    this.validateSchedule(current.broadcastType, nextSchedule.at, nextSchedule.cron);
    this.assertScheduleWindow(member, nextSchedule.at);

    const scheduledAt = nextSchedule.at ?? current.scheduledAt ?? new Date().toISOString();
    const scheduled = await this.db.updateBroadcastCampaign(chatId, campaignId, {
      schedule: nextSchedule,
      status: "scheduled",
      scheduledAt,
      pausedAt: null
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "broadcast.schedule",
      targetType: "broadcast_campaign",
      targetId: campaignId,
      payload: {
        schedule: nextSchedule
      }
    });
    this.emitStateChanged(scheduled);
    await this.queue.enqueueScheduled(scheduled, this.buildJob(scheduled, "scheduled", requestUser.userId));
    this.rememberIdempotency(chatId, campaignId, "schedule", dto.idempotency_key);
    return scheduled;
  }

  async publishNow(chatId: string, campaignId: string, requestUser: RequestUser, dto: PublishNowDto = {}): Promise<BroadcastCampaign> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "broadcast.publish.now");

    const current = await this.db.getBroadcastCampaign(chatId, campaignId);
    this.assertNotFinalStatus(current.status);
    this.assertApprovalSatisfied(current);
    if (this.isDuplicateIdempotency(chatId, campaignId, "publish_now", dto.idempotency_key)) {
      return current;
    }
    this.assertScheduleWindow(member, new Date().toISOString());

    const queued = await this.db.updateBroadcastCampaign(chatId, campaignId, {
      status: "scheduled",
      scheduledAt: new Date().toISOString(),
      pausedAt: null
    });
    this.emitStateChanged(queued);
    await this.queue.enqueueNow(queued, this.buildJob(queued, "manual", requestUser.userId));
    this.rememberIdempotency(chatId, campaignId, "publish_now", dto.idempotency_key);
    return queued;
  }

  async pauseCampaign(chatId: string, campaignId: string, requestUser: RequestUser): Promise<BroadcastCampaign> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "broadcast.pause");

    const current = await this.db.getBroadcastCampaign(chatId, campaignId);
    if (current.status !== "scheduled" && current.status !== "running") {
      throw new BadRequestException("Only scheduled/running campaign can be paused.");
    }

    await this.queue.cancel(campaignId);
    const paused = await this.db.updateBroadcastCampaign(chatId, campaignId, {
      status: "paused",
      pausedAt: new Date().toISOString()
    });
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "broadcast.pause",
      targetType: "broadcast_campaign",
      targetId: campaignId,
      payload: {}
    });
    this.emitStateChanged(paused);
    return paused;
  }

  async resumeCampaign(chatId: string, campaignId: string, requestUser: RequestUser): Promise<BroadcastCampaign> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "broadcast.resume");

    const current = await this.db.getBroadcastCampaign(chatId, campaignId);
    if (current.status !== "paused") {
      throw new BadRequestException("Only paused campaign can be resumed.");
    }
    this.assertApprovalSatisfied(current);

    const resumed = await this.db.updateBroadcastCampaign(chatId, campaignId, {
      status: "scheduled",
      pausedAt: null
    });
    this.emitStateChanged(resumed);

    const at = resumed.schedule.at ? Date.parse(resumed.schedule.at) : NaN;
    if (Number.isFinite(at) && at > Date.now()) {
      await this.queue.enqueueScheduled(resumed, this.buildJob(resumed, "scheduled", requestUser.userId));
      return resumed;
    }

    await this.queue.enqueueNow(resumed, this.buildJob(resumed, "resume", requestUser.userId));
    return resumed;
  }

  async cancelCampaign(chatId: string, campaignId: string, requestUser: RequestUser): Promise<BroadcastCampaign> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "broadcast.cancel");

    const current = await this.db.getBroadcastCampaign(chatId, campaignId);
    this.assertNotFinalStatus(current.status);

    await this.queue.cancel(campaignId);
    const canceled = await this.db.updateBroadcastCampaign(chatId, campaignId, {
      status: "canceled",
      canceledAt: new Date().toISOString()
    });
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "broadcast.cancel",
      targetType: "broadcast_campaign",
      targetId: campaignId,
      payload: {}
    });
    this.emitStateChanged(canceled);
    return canceled;
  }

  async getCampaignStats(chatId: string, campaignId: string, requestUser: RequestUser) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "broadcast.stats.view");

    const campaign = await this.db.getBroadcastCampaign(chatId, campaignId);
    const deliveryRate = campaign.targetCount > 0 ? campaign.sentCount / campaign.targetCount : 0;
    return {
      campaignId: campaign.id,
      status: campaign.status,
      targetCount: campaign.targetCount,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      deliveryRate,
      lastRunAt: campaign.lastRunAt
    };
  }

  private validateSchedule(broadcastType: BroadcastCampaign["broadcastType"], at?: string, cron?: string): void {
    if (broadcastType === "scheduled" && !at) {
      throw new BadRequestException("Scheduled campaign requires schedule.at.");
    }
    if (broadcastType === "recurring" && !cron) {
      throw new BadRequestException("Recurring campaign requires schedule.cron.");
    }
    if (at !== undefined && Number.isNaN(Date.parse(at))) {
      throw new BadRequestException("Invalid schedule.at datetime format.");
    }
  }

  private async validateAudienceScope(
    chatId: string,
    audience: { roles?: string[]; statuses?: string[]; inactive_days_gte?: number; locale?: string[] }
  ): Promise<void> {
    const allowedStatuses = new Set(["active", "newbie", "muted_readonly", "muted", "readonly"]);
    if (audience.statuses) {
      for (const status of audience.statuses) {
        if (!allowedStatuses.has(status)) {
          throw new BadRequestException(`Audience status is not allowed: ${status}`);
        }
      }
    }

    if (audience.roles && audience.roles.length > 0) {
      const roles = await this.db.listRoles(chatId);
      const roleIds = new Set(roles.map((role) => role.id));
      for (const roleId of audience.roles) {
        if (!roleIds.has(roleId)) {
          throw new BadRequestException(`Audience role does not exist in chat: ${roleId}`);
        }
      }
    }

    if (audience.inactive_days_gte !== undefined) {
      const maxInactiveDays = this.parsePositiveInt(this.configService.get<string>("BROADCAST_AUDIENCE_MAX_INACTIVE_DAYS"), 365);
      if (audience.inactive_days_gte > maxInactiveDays) {
        throw new BadRequestException(`inactive_days_gte exceeds allowed maximum (${maxInactiveDays}).`);
      }
    }

    const allowedLocales = this.parseCsv(this.configService.get<string>("BROADCAST_ALLOWED_LOCALES"));
    if (allowedLocales.length > 0 && audience.locale) {
      const allowedSet = new Set(allowedLocales);
      for (const locale of audience.locale) {
        if (!allowedSet.has(locale.toLowerCase())) {
          throw new BadRequestException(`Audience locale is not allowed: ${locale}`);
        }
      }
    }
  }

  private validateTemplateSafety(content: { text?: string; template_id?: string }): void {
    if (!content.text) {
      return;
    }

    if (content.text.includes("{{") || content.text.includes("}}")) {
      throw new BadRequestException("Unsafe template braces detected.");
    }

    const allowedPlaceholders = new Set(this.parseCsv(this.configService.get<string>("BROADCAST_ALLOWED_PLACEHOLDERS", "first_name,chat_name,unread_count")));
    const placeholderRegex = /\{([a-zA-Z0-9_]+)\}/g;
    for (const match of content.text.matchAll(placeholderRegex)) {
      const key = (match[1] ?? "").toLowerCase();
      if (!allowedPlaceholders.has(key)) {
        throw new BadRequestException(`Template placeholder is not allowed: ${key}`);
      }
    }
  }

  private async assertCampaignCreateRate(chatId: string, member: ChatMember): Promise<void> {
    if (await this.policy.hasPermission(chatId, member, "broadcast.rate_limit.bypass")) {
      return;
    }

    const cooldownSeconds = this.parsePositiveInt(this.configService.get<string>("BROADCAST_CREATE_COOLDOWN_SECONDS"), 30);
    const campaigns = await this.db.listBroadcastCampaigns(chatId);
    if (campaigns.length === 0) {
      return;
    }

    const latest = campaigns[0]!;
    const latestTs = Date.parse(latest.createdAt);
    if (!Number.isFinite(latestTs)) {
      return;
    }

    const waitMs = latestTs + cooldownSeconds * 1000 - Date.now();
    if (waitMs > 0) {
      throw new HttpException(`Campaign create cooldown active. Retry in ${Math.ceil(waitMs / 1000)}s.`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private assertScheduleWindow(member: ChatMember, atIso: string | undefined): void {
    if (!atIso) {
      return;
    }

    const checkDate = new Date(atIso);
    if (Number.isNaN(checkDate.getTime())) {
      return;
    }

    const timezone = this.configService.get<string>("BROADCAST_TIMEZONE", "UTC") ?? "UTC";
    const quietEnabled = (this.configService.get<string>("BROADCAST_QUIET_HOURS_ENABLED", "false") ?? "false").toLowerCase() === "true";
    const bypassKey = "broadcast.rate_limit.bypass";

    const maybeBypass = async () => this.policy.hasPermission(member.chatId, member, bypassKey);
    // This method is sync now for call-site simplicity; skip bypass check in sync context.
    // Bypass is still covered by schedule/publish permission scope and can be added async if needed.
    void maybeBypass;

    if (quietEnabled) {
      const startMinute = this.parseHourMinute(this.configService.get<string>("BROADCAST_QUIET_HOURS_START", "23:00") ?? "23:00");
      const endMinute = this.parseHourMinute(this.configService.get<string>("BROADCAST_QUIET_HOURS_END", "07:00") ?? "07:00");
      const minute = this.minuteOfDateInTimezone(checkDate, timezone);
      const inQuiet =
        startMinute === endMinute
          ? true
          : startMinute < endMinute
            ? minute >= startMinute && minute < endMinute
            : minute >= startMinute || minute < endMinute;
      if (inQuiet) {
        throw new BadRequestException("Scheduled time is inside broadcast quiet hours.");
      }
    }

    const blackoutRanges = this.parseBlackoutRanges(this.configService.get<string>("BROADCAST_BLACKOUT_WINDOWS"));
    const ts = checkDate.getTime();
    for (const range of blackoutRanges) {
      if (ts >= range.start && ts <= range.end) {
        throw new BadRequestException("Scheduled time is inside broadcast blackout window.");
      }
    }
  }

  private isDuplicateIdempotency(
    chatId: string,
    campaignId: string,
    operation: "schedule" | "publish_now",
    idempotencyKey?: string
  ): boolean {
    if (!idempotencyKey) {
      return false;
    }
    this.cleanupIdempotency();
    const key = `${chatId}:${campaignId}:${operation}:${idempotencyKey}`;
    return this.idempotencyCache.has(key);
  }

  private rememberIdempotency(
    chatId: string,
    campaignId: string,
    operation: "schedule" | "publish_now",
    idempotencyKey?: string
  ): void {
    if (!idempotencyKey) {
      return;
    }
    this.cleanupIdempotency();
    const ttlSeconds = this.parsePositiveInt(this.configService.get<string>("BROADCAST_IDEMPOTENCY_TTL_SECONDS"), 86400);
    const key = `${chatId}:${campaignId}:${operation}:${idempotencyKey}`;
    this.idempotencyCache.set(key, {
      operation,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  private cleanupIdempotency(): void {
    const now = Date.now();
    for (const [key, entry] of this.idempotencyCache.entries()) {
      if (entry.expiresAt <= now) {
        this.idempotencyCache.delete(key);
      }
    }
  }

  private parseHourMinute(raw: string): number {
    const [h, m] = raw.split(":");
    const hour = Number(h);
    const minute = Number(m);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return 0;
    }
    return Math.max(0, Math.min(23, Math.floor(hour))) * 60 + Math.max(0, Math.min(59, Math.floor(minute)));
  }

  private minuteOfDateInTimezone(date: Date, timezone: string): number {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    const parts = formatter.formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
  }

  private parseBlackoutRanges(raw: string | undefined): Array<{ start: number; end: number }> {
    if (!raw) {
      return [];
    }
    const ranges: Array<{ start: number; end: number }> = [];
    for (const chunk of raw.split(";;")) {
      const [startRaw, endRaw] = chunk.split("..").map((item) => item.trim());
      if (!startRaw || !endRaw) {
        continue;
      }
      const start = Date.parse(startRaw);
      const end = Date.parse(endRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        continue;
      }
      ranges.push({ start, end });
    }
    return ranges;
  }

  private parseCsv(raw: string | undefined): string[] {
    if (!raw) {
      return [];
    }
    return raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return Math.floor(value);
  }

  private validateContent(content: { text?: string; media?: unknown; template_id?: string }): void {
    if (!content.text && !content.media && !content.template_id) {
      throw new BadRequestException("Broadcast content requires text, media, or template_id.");
    }
  }

  private assertMutableStatus(status: BroadcastCampaign["status"]): void {
    if (status === "running" || status === "completed" || status === "canceled") {
      throw new BadRequestException(`Campaign in status "${status}" cannot be updated.`);
    }
  }

  private assertNotFinalStatus(status: BroadcastCampaign["status"]): void {
    if (status === "completed" || status === "canceled") {
      throw new BadRequestException(`Campaign in status "${status}" cannot be changed.`);
    }
  }

  private assertApprovalSatisfied(campaign: BroadcastCampaign): void {
    if (!campaign.requiresApproval) {
      return;
    }
    if (campaign.status !== "approved" && campaign.status !== "scheduled" && campaign.status !== "paused") {
      throw new ForbiddenException("Campaign requires approval before scheduling/publishing.");
    }
  }

  private async validateSenderMode(
    chatId: string,
    member: ChatMember,
    senderMode: "as_user" | "as_group" | "as_role_profile",
    identityId?: string
  ): Promise<void> {
    if (senderMode === "as_user") {
      return;
    }

    await this.policy.assertCan(chatId, member, "message.send.as_group");
    if (!identityId) {
      throw new BadRequestException("identity_id is required for as_group/as_role_profile.");
    }

    const identity = await this.db.getIdentity(chatId, identityId);
    if (!identity.isActive) {
      throw new BadRequestException("Identity is inactive.");
    }
  }

  private buildJob(campaign: BroadcastCampaign, trigger: BroadcastJobTrigger, actorId: string): BroadcastJobData {
    return {
      chatId: campaign.chatId,
      campaignId: campaign.id,
      trigger,
      actorId
    };
  }

  private emitStateChanged(campaign: BroadcastCampaign): void {
    this.eventBus.emit("broadcast.state.changed", {
      chatId: campaign.chatId,
      campaignId: campaign.id,
      status: campaign.status
    });
  }
}
