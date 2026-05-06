import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { TempRoomsService } from "./temp-rooms.service.js";

async function makeRequestUser(db: InMemoryDatabase, telegramId: number, username: string): Promise<RequestUser> {
  const user = await db.upsertTelegramUser({ telegramId, username });
  await db.ensureMember("main", user.id);
  return {
    userId: user.id,
    telegramId: user.telegramId
  };
}

function createFixture() {
  const db = new InMemoryDatabase();
  const policy = new PolicyService(db);
  const tempRoomsService = new TempRoomsService(db, policy);
  return { db, tempRoomsService };
}

describe("TempRoomsService", () => {
  it("creates temp room and writes audit log", async () => {
    const { db, tempRoomsService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "temp_room_operator",
      priority: 1300,
      isDefault: false,
      permissions: ["room.temp.create"]
    });
    const actor = await makeRequestUser(db, 980001, "temp_room_actor");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const created = await tempRoomsService.createTempRoom("main", actor, {
      name: "Incident room #1",
      description: "Incident war-room for current event",
      starts_at: "2026-04-25T10:00:00.000Z",
      ends_at: "2026-04-26T10:00:00.000Z",
      inherit_permissions: true,
      permission_overrides: {
        chat_mode: "channel_mode"
      }
    });

    expect(created.name).toBe("Incident room #1");
    expect(created.status).toBe("active");
    expect(created.inheritPermissions).toBe(true);
    expect(created.permissionOverrides).toEqual({ chat_mode: "channel_mode" });

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("room.temp.create");
  });

  it("denies creation without room.temp.create permission", async () => {
    const { db, tempRoomsService } = createFixture();
    const member = await makeRequestUser(db, 980002, "temp_room_member");

    await expect(
      tempRoomsService.createTempRoom("main", member, {
        name: "Denied room"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects invalid date range", async () => {
    const { db, tempRoomsService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "temp_room_validator",
      priority: 1300,
      isDefault: false,
      permissions: ["room.temp.create"]
    });
    const actor = await makeRequestUser(db, 980003, "temp_room_validator_actor");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    await expect(
      tempRoomsService.createTempRoom("main", actor, {
        name: "Invalid room",
        starts_at: "2026-04-26T10:00:00.000Z",
        ends_at: "2026-04-26T09:00:00.000Z"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("archives and restores temp room with audit logs", async () => {
    const { db, tempRoomsService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "temp_room_lifecycle_operator",
      priority: 1300,
      isDefault: false,
      permissions: ["room.temp.create", "room.temp.archive", "room.temp.restore"]
    });
    const actor = await makeRequestUser(db, 980004, "temp_room_lifecycle_actor");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const created = await tempRoomsService.createTempRoom("main", actor, {
      name: "Lifecycle room"
    });
    expect(created.status).toBe("active");

    const archived = await tempRoomsService.archiveTempRoom("main", created.id, actor, { reason: "event ended" });
    expect(archived.ok).toBe(true);
    expect(archived.alreadyArchived).toBe(false);
    expect(archived.room.status).toBe("archived");
    expect(archived.room.archivedAt).toBeTruthy();

    const restored = await tempRoomsService.restoreTempRoom("main", created.id, actor, { reason: "reopen" });
    expect(restored.ok).toBe(true);
    expect(restored.alreadyActive).toBe(false);
    expect(restored.room.status).toBe("active");
    expect(restored.room.archivedAt).toBeNull();

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("room.temp.archive");
    expect(actions).toContain("room.temp.restore");
  });

  it("denies archive/restore without required permissions", async () => {
    const { db, tempRoomsService } = createFixture();
    const creatorRole = await db.createRole({
      chatId: "main",
      name: "temp_room_creator_only",
      priority: 1300,
      isDefault: false,
      permissions: ["room.temp.create"]
    });
    const actor = await makeRequestUser(db, 980005, "temp_room_creator_only_actor");
    await db.updateMemberRole("main", actor.userId, creatorRole.id);

    const created = await tempRoomsService.createTempRoom("main", actor, {
      name: "No lifecycle perm room"
    });

    await expect(tempRoomsService.archiveTempRoom("main", created.id, actor, {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(tempRoomsService.restoreTempRoom("main", created.id, actor, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("auto archives due temp rooms and writes system audit entries", async () => {
    const { db, tempRoomsService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "temp_room_auto_archive_operator",
      priority: 1300,
      isDefault: false,
      permissions: ["room.temp.create"]
    });
    const actor = await makeRequestUser(db, 980006, "temp_room_auto_archive_actor");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const now = Date.now();
    const due = await tempRoomsService.createTempRoom("main", actor, {
      name: "Due room",
      starts_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(now - 30 * 60 * 1000).toISOString()
    });
    const future = await tempRoomsService.createTempRoom("main", actor, {
      name: "Future room",
      starts_at: new Date(now - 10 * 60 * 1000).toISOString(),
      ends_at: new Date(now + 2 * 60 * 60 * 1000).toISOString()
    });

    const archivedCount = await tempRoomsService.autoArchiveDueRooms(new Date(now).toISOString());
    expect(archivedCount).toBe(1);

    const dueState = await db.getTempRoom("main", due.id);
    const futureState = await db.getTempRoom("main", future.id);
    expect(dueState.status).toBe("archived");
    expect(dueState.archivedAt).toBeTruthy();
    expect(futureState.status).toBe("active");

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("room.temp.archive.auto");
  });
});
