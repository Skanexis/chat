import { Inject, Injectable } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import type { BroadcastCampaign, ChatMember } from "../../core/types.js";
import type { BroadcastJobData } from "./broadcasts.types.js";

@Injectable()
export class BroadcastExecutionService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly eventBus: EventBusService
  ) {}

  async execute(data: BroadcastJobData): Promise<BroadcastCampaign> {
    const current = await this.db.getBroadcastCampaign(data.chatId, data.campaignId);
    if (current.status === "canceled" || current.status === "completed" || current.status === "paused") {
      return current;
    }

    const now = new Date().toISOString();
    const running = await this.db.updateBroadcastCampaign(data.chatId, data.campaignId, {
      status: "running",
      startedAt: now,
      pausedAt: null
    });
    this.emitStateChanged(running);

    const members = await this.db.listMembers(data.chatId);
    const targeted = this.filterAudience(members, running.audience);
    const targetCount = targeted.length;
    const sentCount = targetCount;
    const failedCount = 0;

    const completedAt = new Date().toISOString();
    const completed = await this.db.updateBroadcastCampaign(data.chatId, data.campaignId, {
      status: "completed",
      completedAt,
      lastRunAt: completedAt,
      targetCount,
      sentCount,
      failedCount
    });

    await this.db.addAuditLog({
      chatId: data.chatId,
      actorId: data.actorId,
      action: "broadcast.execute",
      targetType: "broadcast_campaign",
      targetId: data.campaignId,
      payload: {
        trigger: data.trigger,
        targetCount,
        sentCount,
        failedCount
      }
    });

    this.eventBus.emit("broadcast.delivery.progress", {
      chatId: data.chatId,
      campaignId: data.campaignId,
      targetCount,
      sentCount,
      failedCount
    });
    this.emitStateChanged(completed);
    return completed;
  }

  private filterAudience(members: ChatMember[], audience: BroadcastCampaign["audience"]): ChatMember[] {
    const nowTs = Date.now();
    return members.filter((member) => {
      if (member.status === "banned") {
        return false;
      }

      if (audience.roles && audience.roles.length > 0 && !audience.roles.includes(member.roleId)) {
        return false;
      }

      if (audience.statuses && audience.statuses.length > 0) {
        const joinedAtTs = Date.parse(member.joinedAt);
        const isNewbie = Number.isFinite(joinedAtTs) && nowTs - joinedAtTs <= 7 * 24 * 60 * 60 * 1000;
        const mappedStatuses = new Set<string>([member.status]);
        if (isNewbie) {
          mappedStatuses.add("newbie");
        }
        if (member.status === "muted" || member.status === "readonly") {
          mappedStatuses.add("muted_readonly");
        }
        const statusMatched = audience.statuses.some((status) => mappedStatuses.has(status));
        if (!statusMatched) {
          return false;
        }
      }

      return true;
    });
  }

  private emitStateChanged(campaign: BroadcastCampaign): void {
    this.eventBus.emit("broadcast.state.changed", {
      chatId: campaign.chatId,
      campaignId: campaign.id,
      status: campaign.status
    });
  }
}
