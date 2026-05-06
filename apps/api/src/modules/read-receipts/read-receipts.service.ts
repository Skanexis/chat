import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { ReadReceipt, ReadReceiptMode, RequestUser } from "../../core/types.js";
import type { MarkReadReceiptDto, UpdateReadReceiptPrivacyDto } from "./read-receipts.dto.js";

@Injectable()
export class ReadReceiptsService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly configService: ConfigService
  ) {}

  async markRead(chatId: string, messageId: string, requestUser: RequestUser, dto: MarkReadReceiptDto): Promise<{
    ok: true;
    stored: boolean;
    mode: ReadReceiptMode;
    readAt: string | null;
  }> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "chat.view");
    await this.policy.assertCan(chatId, member, "read_receipt.view.own");

    const mode = await this.resolveMode(chatId, requestUser.userId);
    if (mode === "off") {
      await this.db.addAuditLog({
        chatId,
        actorId: requestUser.userId,
        action: "read_receipt.mark",
        targetType: "message",
        targetId: messageId,
        payload: {
          stored: false,
          reason: "mode_off"
        }
      });
      return {
        ok: true,
        stored: false,
        mode,
        readAt: null
      };
    }

    await this.db.getMessage(chatId, messageId);
    const readAt = this.parseReadAt(dto.read_at);
    await this.db.upsertReadReceipt(chatId, messageId, requestUser.userId, readAt);

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "read_receipt.mark",
      targetType: "message",
      targetId: messageId,
      payload: {
        stored: true,
        mode,
        readAt
      }
    });

    return {
      ok: true,
      stored: true,
      mode,
      readAt
    };
  }

  async getReadReceipts(chatId: string, messageId: string, requestUser: RequestUser) {
    const viewer = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(viewer);
    await this.policy.assertCan(chatId, viewer, "read_receipt.view.own");

    await this.db.getMessage(chatId, messageId);

    const [receipts, policyState] = await Promise.all([
      this.db.listReadReceipts(chatId, messageId),
      this.db.getReadReceiptPolicy(chatId)
    ]);

    const ownReceipt = receipts.find((receipt) => receipt.userId === requestUser.userId) ?? null;
    const canViewAny = await this.policy.hasPermission(chatId, viewer, "read_receipt.view.any");
    if (!canViewAny) {
      const visible = ownReceipt ? [ownReceipt] : [];
      await this.auditReadView(chatId, requestUser.userId, messageId, receipts.length, visible.length);
      return {
        messageId,
        ownReadAt: ownReceipt?.readAt ?? null,
        mode: await this.resolveMode(chatId, requestUser.userId),
        totals: {
          readers: receipts.length,
          visible_readers: visible.length,
          hidden_readers: receipts.length - visible.length
        },
        byRole: ownReceipt ? [{ roleId: viewer.roleId, count: 1 }] : [],
        readers: visible.map((receipt) => ({
          userId: receipt.userId,
          roleId: viewer.roleId,
          readAt: receipt.readAt
        }))
      };
    }

    const [members, viewerWildcard] = await Promise.all([
      this.db.listMembers(chatId),
      this.policy.hasPermission(chatId, viewer, "*")
    ]);
    const memberByUserId = new Map(members.map((member) => [member.userId, member]));
    const modeCache = new Map<string, ReadReceiptMode>();

    const visible: Array<ReadReceipt & { roleId: string }> = [];
    for (const receipt of receipts) {
      const targetMember = memberByUserId.get(receipt.userId);
      if (!targetMember) {
        continue;
      }

      if (receipt.userId === requestUser.userId) {
        visible.push({ ...receipt, roleId: targetMember.roleId });
        continue;
      }

      const mode = await this.resolveModeCached(chatId, receipt.userId, modeCache);
      if (mode === "off" || mode === "private") {
        continue;
      }

      const sameRole = targetMember.roleId === viewer.roleId;
      if (mode === "role_visible" && !sameRole) {
        continue;
      }

      if (!policyState.allowCrossRoleView && !sameRole && !viewerWildcard) {
        continue;
      }

      visible.push({ ...receipt, roleId: targetMember.roleId });
    }

    await this.auditReadView(chatId, requestUser.userId, messageId, receipts.length, visible.length);
    return {
      messageId,
      ownReadAt: ownReceipt?.readAt ?? null,
      mode: await this.resolveMode(chatId, requestUser.userId),
      totals: {
        readers: receipts.length,
        visible_readers: visible.length,
        hidden_readers: receipts.length - visible.length
      },
      byRole: this.aggregateByRole(visible),
      readers: visible.map((receipt) => ({
        userId: receipt.userId,
        roleId: receipt.roleId,
        readAt: receipt.readAt
      }))
    };
  }

  async getPrivacy(chatId: string, requestUser: RequestUser) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "chat.view");

    const [mode, policyState, canViewAny, canManage] = await Promise.all([
      this.resolveMode(chatId, requestUser.userId),
      this.db.getReadReceiptPolicy(chatId),
      this.policy.hasPermission(chatId, member, "read_receipt.view.any"),
      this.policy.hasPermission(chatId, member, "read_receipt.privacy.manage")
    ]);

    return {
      mode,
      canManage,
      policy: canViewAny
        ? policyState
        : {
            chatId,
            allowCrossRoleView: policyState.allowCrossRoleView,
            updatedAt: policyState.updatedAt
          }
    };
  }

  async updatePrivacy(chatId: string, requestUser: RequestUser, dto: UpdateReadReceiptPrivacyDto) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);

    const hasModePatch = dto.mode !== undefined;
    const hasPolicyPatch = dto.allow_cross_role_view !== undefined;
    if (!hasModePatch && !hasPolicyPatch) {
      throw new BadRequestException("Privacy update requires mode and/or allow_cross_role_view field.");
    }

    let modeState: { userId: string; mode: ReadReceiptMode } | null = null;
    if (hasModePatch) {
      const targetUserId = dto.target_user_id ?? requestUser.userId;
      if (targetUserId !== requestUser.userId) {
        await this.policy.assertCan(chatId, member, "read_receipt.privacy.manage");
        await this.policy.assertCan(chatId, member, "read_receipt.view.any");
        await this.db.ensureMember(chatId, targetUserId);
      } else {
        await this.policy.assertCan(chatId, member, "read_receipt.privacy.manage");
      }

      const updated = await this.db.upsertReadReceiptPreference(chatId, targetUserId, dto.mode!);
      modeState = {
        userId: updated.userId,
        mode: updated.mode
      };
    }

    let policyState = await this.db.getReadReceiptPolicy(chatId);
    if (hasPolicyPatch) {
      await this.policy.assertCan(chatId, member, "read_receipt.privacy.manage");
      await this.policy.assertCan(chatId, member, "read_receipt.view.any");
      policyState = await this.db.upsertReadReceiptPolicy(chatId, {
        allowCrossRoleView: dto.allow_cross_role_view,
        updatedBy: requestUser.userId
      });
    }

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "read_receipt.privacy.update",
      targetType: "chat",
      targetId: chatId,
      payload: {
        target_user_id: modeState?.userId ?? null,
        mode: modeState?.mode ?? null,
        allow_cross_role_view: hasPolicyPatch ? dto.allow_cross_role_view : null
      }
    });

    return {
      ok: true,
      mode: modeState,
      policy: policyState
    };
  }

  private async resolveMode(chatId: string, userId: string): Promise<ReadReceiptMode> {
    const saved = await this.db.getReadReceiptPreference(chatId, userId);
    if (saved) {
      return saved.mode;
    }
    return this.resolveDefaultMode();
  }

  private async resolveModeCached(chatId: string, userId: string, cache: Map<string, ReadReceiptMode>): Promise<ReadReceiptMode> {
    const cached = cache.get(userId);
    if (cached) {
      return cached;
    }
    const resolved = await this.resolveMode(chatId, userId);
    cache.set(userId, resolved);
    return resolved;
  }

  private resolveDefaultMode(): ReadReceiptMode {
    const raw = (this.configService.get<string>("READ_RECEIPTS_MODE_DEFAULT", "private") ?? "private").toLowerCase();
    if (raw === "off") {
      return "off";
    }
    if (raw === "role_visible") {
      return "role_visible";
    }
    if (raw === "global") {
      return "global";
    }
    return "private";
  }

  private parseReadAt(value?: string): string {
    if (!value) {
      return new Date().toISOString();
    }
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException("read_at must be a valid ISO datetime.");
    }
    return new Date(parsed).toISOString();
  }

  private aggregateByRole(receipts: Array<{ roleId: string }>): Array<{ roleId: string; count: number }> {
    const byRole = new Map<string, number>();
    for (const receipt of receipts) {
      byRole.set(receipt.roleId, (byRole.get(receipt.roleId) ?? 0) + 1);
    }

    return Array.from(byRole.entries())
      .map(([roleId, count]) => ({ roleId, count }))
      .sort((a, b) => b.count - a.count || a.roleId.localeCompare(b.roleId));
  }

  private async auditReadView(
    chatId: string,
    actorId: string,
    messageId: string,
    totalReaders: number,
    visibleReaders: number
  ): Promise<void> {
    await this.db.addAuditLog({
      chatId,
      actorId,
      action: "read_receipt.view",
      targetType: "message",
      targetId: messageId,
      payload: {
        total_readers: totalReaders,
        visible_readers: visibleReaders,
        hidden_readers: totalReaders - visibleReaders
      }
    });
  }
}
