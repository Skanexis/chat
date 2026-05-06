import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser, TempRoom } from "../../core/types.js";
import type { ArchiveTempRoomDto, CreateTempRoomDto, RestoreTempRoomDto } from "./temp-rooms.dto.js";

@Injectable()
export class TempRoomsService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService
  ) {}

  async createTempRoom(chatId: string, requestUser: RequestUser, dto: CreateTempRoomDto): Promise<TempRoom> {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "room.temp.create");

    const name = this.normalizeName(dto.name);
    const description = this.normalizeDescription(dto.description);
    const startsAt = this.normalizeIsoDatetime(dto.starts_at, "starts_at");
    const endsAt = this.normalizeIsoDatetime(dto.ends_at, "ends_at");
    this.assertDateRange(startsAt, endsAt);

    const created = await this.db.createTempRoom({
      chatId,
      name,
      description,
      startsAt,
      endsAt,
      inheritPermissions: dto.inherit_permissions ?? true,
      permissionOverrides: dto.permission_overrides ?? {},
      status: "active",
      createdBy: requestUser.userId,
      archivedAt: null
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "room.temp.create",
      targetType: "temp_room",
      targetId: created.id,
      payload: {
        name: created.name,
        starts_at: created.startsAt,
        ends_at: created.endsAt,
        inherit_permissions: created.inheritPermissions
      }
    });

    return created;
  }

  async archiveTempRoom(chatId: string, tempRoomId: string, requestUser: RequestUser, dto: ArchiveTempRoomDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "room.temp.archive");

    const current = await this.db.getTempRoom(chatId, tempRoomId);
    if (current.status === "archived") {
      return {
        ok: true,
        alreadyArchived: true,
        room: current
      };
    }

    const archivedAt = new Date().toISOString();
    const updated = await this.db.updateTempRoom(chatId, tempRoomId, {
      status: "archived",
      archivedAt
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "room.temp.archive",
      targetType: "temp_room",
      targetId: updated.id,
      payload: {
        reason: dto.reason ?? null,
        archived_at: archivedAt
      }
    });

    return {
      ok: true,
      alreadyArchived: false,
      room: updated
    };
  }

  async restoreTempRoom(chatId: string, tempRoomId: string, requestUser: RequestUser, dto: RestoreTempRoomDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "room.temp.restore");

    const current = await this.db.getTempRoom(chatId, tempRoomId);
    if (current.status === "active") {
      return {
        ok: true,
        alreadyActive: true,
        room: current
      };
    }

    const updated = await this.db.updateTempRoom(chatId, tempRoomId, {
      status: "active",
      archivedAt: null
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "room.temp.restore",
      targetType: "temp_room",
      targetId: updated.id,
      payload: {
        reason: dto.reason ?? null
      }
    });

    return {
      ok: true,
      alreadyActive: false,
      room: updated
    };
  }

  async autoArchiveDueRooms(nowIso = new Date().toISOString()): Promise<number> {
    const dueRooms = await this.db.listDueTempRoomsForAutoArchive(nowIso);
    let archivedCount = 0;
    for (const room of dueRooms) {
      const archivedAt = new Date().toISOString();
      await this.db.updateTempRoom(room.chatId, room.id, {
        status: "archived",
        archivedAt
      });
      await this.db.addAuditLog({
        chatId: room.chatId,
        actorId: "system",
        action: "room.temp.archive.auto",
        targetType: "temp_room",
        targetId: room.id,
        payload: {
          reason: "auto_archive_ends_at",
          ends_at: room.endsAt,
          archived_at: archivedAt
        }
      });
      archivedCount += 1;
    }

    return archivedCount;
  }

  private normalizeName(raw: string): string {
    const value = raw.trim();
    if (!value) {
      throw new BadRequestException("name cannot be empty.");
    }
    return value;
  }

  private normalizeDescription(raw?: string): string | null {
    const value = raw?.trim();
    if (!value) {
      return null;
    }
    return value;
  }

  private normalizeIsoDatetime(raw: string | undefined, field: string): string | null {
    if (raw === undefined) {
      return null;
    }
    const timestamp = Date.parse(raw);
    if (Number.isNaN(timestamp)) {
      throw new BadRequestException(`${field} must be a valid ISO datetime.`);
    }
    return new Date(timestamp).toISOString();
  }

  private assertDateRange(startsAt: string | null, endsAt: string | null): void {
    if (!endsAt) {
      return;
    }

    if (startsAt && endsAt <= startsAt) {
      throw new BadRequestException("ends_at must be greater than starts_at.");
    }

    if (!startsAt && endsAt <= new Date().toISOString()) {
      throw new BadRequestException("ends_at must be in the future.");
    }
  }
}
