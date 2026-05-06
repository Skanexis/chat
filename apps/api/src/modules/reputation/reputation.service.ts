import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import type { AdjustReputationDto } from "./reputation.dto.js";

@Injectable()
export class ReputationService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly eventBus: EventBusService
  ) {}

  async adjust(chatId: string, requestUser: RequestUser, dto: AdjustReputationDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "reputation.adjust");

    const target = await this.db.getMember(chatId, dto.user_id);
    if (!target) {
      throw new NotFoundException(`Member ${dto.user_id} is not in chat ${chatId}.`);
    }

    const reason = this.normalizeReason(dto.reason);
    const sourceType = this.normalizeSourceType(dto.source_type);
    const sourceId = this.normalizeSourceId(dto.source_id);

    const event = await this.db.createReputationEvent({
      chatId,
      userId: target.userId,
      delta: dto.delta,
      reason,
      sourceType,
      sourceId,
      actorId: requestUser.userId
    });
    const score = await this.db.getReputationScore(chatId, target.userId);

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "reputation.adjust",
      targetType: "reputation",
      targetId: event.id,
      payload: {
        user_id: target.userId,
        delta: event.delta,
        reason: event.reason,
        source_type: event.sourceType,
        source_id: event.sourceId,
        score
      }
    });

    this.eventBus.emit("reputation.updated", {
      chatId,
      userId: target.userId,
      delta: event.delta,
      score,
      reason: event.reason,
      actorId: requestUser.userId,
      eventId: event.id
    });

    return {
      ok: true,
      event,
      score
    };
  }

  private normalizeReason(raw: string): string {
    const value = raw.trim();
    if (!value) {
      throw new BadRequestException("reason cannot be empty.");
    }
    return value;
  }

  private normalizeSourceType(raw?: string): string {
    const value = raw?.trim();
    if (!value) {
      return "manual_adjustment";
    }
    return value;
  }

  private normalizeSourceId(raw?: string): string | null {
    const value = raw?.trim();
    if (!value) {
      return null;
    }
    return value;
  }
}
