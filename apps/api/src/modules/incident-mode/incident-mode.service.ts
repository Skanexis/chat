import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import type { DisableIncidentModeDto, EnableIncidentModeDto } from "./incident-mode.dto.js";

@Injectable()
export class IncidentModeService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly eventBus: EventBusService
  ) {}

  async enable(chatId: string, requestUser: RequestUser, dto: EnableIncidentModeDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "incident_mode.enable");

    const active = await this.db.getActiveIncidentMode(chatId);
    if (active) {
      throw new BadRequestException("Incident mode is already enabled.");
    }

    if (dto.policy_snapshot_json !== undefined) {
      await this.policy.assertCan(chatId, actor, "incident_mode.policy.edit");
    }

    const state = await this.db.createIncidentModeLog({
      chatId,
      enabledBy: requestUser.userId,
      enabledAt: new Date().toISOString(),
      disabledAt: null,
      policySnapshot: dto.policy_snapshot_json ?? this.buildDefaultPolicySnapshot(),
      reason: dto.reason
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "incident_mode.enable",
      targetType: "incident_mode",
      targetId: state.id,
      payload: {
        reason: dto.reason,
        policySnapshot: state.policySnapshot
      }
    });

    this.eventBus.emit("incident_mode.changed", {
      chatId,
      enabled: true,
      reason: dto.reason,
      state
    });

    return {
      ok: true,
      state
    };
  }

  async disable(chatId: string, requestUser: RequestUser, dto: DisableIncidentModeDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "incident_mode.disable");

    const active = await this.db.getActiveIncidentMode(chatId);
    if (!active) {
      throw new BadRequestException("Incident mode is not enabled.");
    }

    const reason = dto.reason?.trim() || "manual_disable";
    const state = await this.db.closeIncidentMode(chatId, new Date().toISOString());

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "incident_mode.disable",
      targetType: "incident_mode",
      targetId: state.id,
      payload: {
        reason
      }
    });

    this.eventBus.emit("incident_mode.changed", {
      chatId,
      enabled: false,
      reason,
      state
    });

    return {
      ok: true,
      state
    };
  }

  async autoRollbackExpired(nowIso: string, rollbackMinutes: number): Promise<number> {
    if (rollbackMinutes <= 0) {
      return 0;
    }

    const nowTs = Date.parse(nowIso);
    const cutoffTs = nowTs - rollbackMinutes * 60 * 1000;
    const activeModes = await this.db.listActiveIncidentModes();
    let rolledBackCount = 0;

    for (const active of activeModes) {
      const enabledAtTs = Date.parse(active.enabledAt);
      if (!Number.isFinite(enabledAtTs) || enabledAtTs > cutoffTs) {
        continue;
      }

      try {
        const state = await this.db.closeIncidentMode(active.chatId, new Date(nowTs).toISOString());
        await this.db.addAuditLog({
          chatId: active.chatId,
          actorId: "system",
          action: "incident_mode.auto_rollback",
          targetType: "incident_mode",
          targetId: state.id,
          payload: {
            reason: "auto_rollback_timeout",
            rollback_minutes: rollbackMinutes,
            enabled_at: active.enabledAt,
            disabled_at: state.disabledAt
          }
        });

        this.eventBus.emit("incident_mode.changed", {
          chatId: active.chatId,
          enabled: false,
          reason: "auto_rollback_timeout",
          state
        });

        rolledBackCount += 1;
      } catch {
        // Active state may be closed concurrently by manual API path; skip.
      }
    }

    return rolledBackCount;
  }

  private buildDefaultPolicySnapshot(): Record<string, unknown> {
    return {
      pre_moderation_enabled: true,
      external_links_blocked: true,
      anti_spam_strict: true,
      source: "default_incident_policy_v1"
    };
  }
}
