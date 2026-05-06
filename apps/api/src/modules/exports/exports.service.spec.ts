import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { ExportsService } from "./exports.service.js";

async function createUserWithPermissions(
  db: InMemoryDatabase,
  telegramId: number,
  username: string,
  permissions: string[]
): Promise<RequestUser> {
  await db.createRole({
    chatId: "main",
    name: `role_${username}`,
    priority: 5000,
    permissions,
    isDefault: true
  });
  const user = await db.upsertTelegramUser({ telegramId, username });
  await db.ensureMember("main", user.id);
  return {
    userId: user.id,
    telegramId: user.telegramId
  };
}

describe("ExportsService", () => {
  it("requires audit.export permission", async () => {
    const db = new InMemoryDatabase();
    const service = new ExportsService(db, new PolicyService(db));
    const user = await createUserWithPermissions(db, 901001, "no_export", ["chat.view"]);

    await expect(service.exportHistory("main", user, { format: "jsonl" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("exports filtered jsonl history", async () => {
    const db = new InMemoryDatabase();
    const service = new ExportsService(db, new PolicyService(db));
    const exporter = await createUserWithPermissions(db, 901002, "exporter", ["audit.export"]);
    const authorA = await createUserWithPermissions(db, 901003, "author_a", ["message.send.text"]);
    const authorB = await createUserWithPermissions(db, 901004, "author_b", ["message.send.text"]);

    await db.createMessage({
      chatId: "main",
      authorId: authorA.userId,
      actorUserId: authorA.userId,
      displayAuthorType: "user",
      displayAuthorId: authorA.userId,
      senderMode: "as_user",
      text: "alpha",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });
    await db.createMessage({
      chatId: "main",
      authorId: authorB.userId,
      actorUserId: authorB.userId,
      displayAuthorType: "user",
      displayAuthorId: authorB.userId,
      senderMode: "as_user",
      text: "beta",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const result = await service.exportHistory("main", exporter, {
      format: "jsonl",
      author_id: authorA.userId
    });

    const lines = result.content.split("\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "{}") as { author_id: string; text: string };
    expect(parsed.author_id).toBe(authorA.userId);
    expect(parsed.text).toBe("alpha");
  });

  it("escapes csv cells", async () => {
    const db = new InMemoryDatabase();
    const service = new ExportsService(db, new PolicyService(db));
    const exporter = await createUserWithPermissions(db, 901005, "csv_exporter", ["audit.export"]);
    const author = await createUserWithPermissions(db, 901006, "csv_author", ["message.send.text"]);

    await db.createMessage({
      chatId: "main",
      authorId: author.userId,
      actorUserId: author.userId,
      displayAuthorType: "user",
      displayAuthorId: author.userId,
      senderMode: "as_user",
      text: "a, \"quoted\" value",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const result = await service.exportHistory("main", exporter, { format: "csv" });
    expect(result.content).toContain("\"a, \"\"quoted\"\" value\"");
    expect(result.content.split("\n").length).toBeGreaterThan(1);
  });

  it("exports archived temp room history and writes dedicated audit action", async () => {
    const db = new InMemoryDatabase();
    const service = new ExportsService(db, new PolicyService(db));
    const exporter = await createUserWithPermissions(db, 901007, "temp_room_exporter", ["audit.export"]);
    const author = await createUserWithPermissions(db, 901008, "temp_room_author", ["message.send.text"]);

    const room = await db.createTempRoom({
      chatId: "main",
      name: "Archived room",
      description: null,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 60_000).toISOString(),
      status: "active",
      inheritPermissions: true,
      permissionOverrides: {},
      createdBy: exporter.userId,
      archivedAt: null
    });
    await db.updateTempRoom("main", room.id, {
      status: "archived",
      archivedAt: new Date().toISOString()
    });

    await db.createMessage({
      chatId: "main",
      authorId: author.userId,
      actorUserId: author.userId,
      displayAuthorType: "user",
      displayAuthorId: author.userId,
      senderMode: "as_user",
      text: "room scoped export message",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const result = await service.exportTempRoomHistory("main", room.id, exporter, { format: "jsonl" });
    expect(result.rows).toBe(1);
    expect(result.content).toContain("room scoped export message");

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("history.export.temp_room");
  });

  it("rejects temp room export when room is not archived", async () => {
    const db = new InMemoryDatabase();
    const service = new ExportsService(db, new PolicyService(db));
    const exporter = await createUserWithPermissions(db, 901009, "temp_room_exporter_active", ["audit.export"]);

    const room = await db.createTempRoom({
      chatId: "main",
      name: "Active room",
      description: null,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 60_000).toISOString(),
      status: "active",
      inheritPermissions: true,
      permissionOverrides: {},
      createdBy: exporter.userId,
      archivedAt: null
    });

    await expect(service.exportTempRoomHistory("main", room.id, exporter, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it("constrains temp room export to room time window", async () => {
    const db = new InMemoryDatabase();
    const service = new ExportsService(db, new PolicyService(db));
    const exporter = await createUserWithPermissions(db, 901010, "temp_room_exporter_constrained", ["audit.export"]);
    const author = await createUserWithPermissions(db, 901011, "temp_room_author_constrained", ["message.send.text"]);

    await db.createMessage({
      chatId: "main",
      authorId: author.userId,
      actorUserId: author.userId,
      displayAuthorType: "user",
      displayAuthorId: author.userId,
      senderMode: "as_user",
      text: "outside room window",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const room = await db.createTempRoom({
      chatId: "main",
      name: "Past archived room",
      description: null,
      startsAt: "2020-01-01T00:00:00.000Z",
      endsAt: "2020-01-01T01:00:00.000Z",
      status: "archived",
      inheritPermissions: true,
      permissionOverrides: {},
      createdBy: exporter.userId,
      archivedAt: "2020-01-01T01:00:00.000Z"
    });

    const result = await service.exportTempRoomHistory("main", room.id, exporter, { format: "jsonl" });
    expect(result.rows).toBe(0);
    expect(result.content).toBe("");
  });
});
