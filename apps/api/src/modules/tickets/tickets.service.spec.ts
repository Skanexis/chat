import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { TicketsService } from "./tickets.service.js";

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
  const eventBus = new EventBusService();
  const ticketsService = new TicketsService(db, policy, eventBus);
  return { db, eventBus, ticketsService };
}

describe("TicketsService", () => {
  it("creates and updates ticket with state transitions, audit and ws event payloads", async () => {
    const { db, eventBus, ticketsService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "ticket_operator",
      priority: 1500,
      isDefault: false,
      permissions: ["ticket.create", "ticket.assign", "ticket.close"]
    });

    const actor = await makeRequestUser(db, 940001, "ticket_actor");
    const assignee = await makeRequestUser(db, 940002, "ticket_assignee");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const source = await db.createMessage({
      chatId: "main",
      authorId: actor.userId,
      actorUserId: actor.userId,
      displayAuthorType: "user",
      displayAuthorId: actor.userId,
      senderMode: "as_user",
      text: "source message",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const ticketStates: string[] = [];
    const off = eventBus.on("ticket.updated", (payload) => ticketStates.push(payload.status));

    const created = await ticketsService.createTicket("main", actor, {
      source_message_id: source.id,
      priority: "high",
      assignee_id: assignee.userId,
      labels: ["moderation"]
    });
    expect(created.status).toBe("open");
    expect(created.priority).toBe("high");
    expect(created.assigneeId).toBe(assignee.userId);

    const progress = await ticketsService.updateTicket("main", created.id, actor, { status: "in_progress" });
    expect(progress.status).toBe("in_progress");

    const resolved = await ticketsService.updateTicket("main", created.id, actor, { status: "resolved" });
    expect(resolved.status).toBe("resolved");

    const closed = await ticketsService.updateTicket("main", created.id, actor, { status: "closed" });
    expect(closed.status).toBe("closed");

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("ticket.create");
    expect(actions).toContain("ticket.update");
    expect(ticketStates).toEqual(["open", "in_progress", "resolved", "closed"]);

    off();
  });

  it("denies ticket creation for member without ticket.create", async () => {
    const { db, ticketsService } = createFixture();
    const member = await makeRequestUser(db, 940003, "plain_member");

    const source = await db.createMessage({
      chatId: "main",
      authorId: member.userId,
      actorUserId: member.userId,
      displayAuthorType: "user",
      displayAuthorId: member.userId,
      senderMode: "as_user",
      text: "source message",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    await expect(
      ticketsService.createTicket("main", member, {
        source_message_id: source.id
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects invalid transition from closed back to in_progress", async () => {
    const { db, ticketsService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "ticket_operator_for_transition",
      priority: 1500,
      isDefault: false,
      permissions: ["ticket.create", "ticket.assign", "ticket.close"]
    });
    const actor = await makeRequestUser(db, 940004, "transition_actor");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const source = await db.createMessage({
      chatId: "main",
      authorId: actor.userId,
      actorUserId: actor.userId,
      displayAuthorType: "user",
      displayAuthorId: actor.userId,
      senderMode: "as_user",
      text: "source message",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const created = await ticketsService.createTicket("main", actor, {
      source_message_id: source.id
    });
    await ticketsService.updateTicket("main", created.id, actor, { status: "closed" });

    await expect(
      ticketsService.updateTicket("main", created.id, actor, {
        status: "in_progress"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires ticket.sla.manage for sla_due_at create/update operations", async () => {
    const { db, ticketsService } = createFixture();
    const operatorWithoutSlaRole = await db.createRole({
      chatId: "main",
      name: "ticket_operator_without_sla",
      priority: 1500,
      isDefault: false,
      permissions: ["ticket.create", "ticket.assign", "ticket.close"]
    });
    const actor = await makeRequestUser(db, 940005, "ticket_no_sla_actor");
    await db.updateMemberRole("main", actor.userId, operatorWithoutSlaRole.id);

    const source = await db.createMessage({
      chatId: "main",
      authorId: actor.userId,
      actorUserId: actor.userId,
      displayAuthorType: "user",
      displayAuthorId: actor.userId,
      senderMode: "as_user",
      text: "source message",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    await expect(
      ticketsService.createTicket("main", actor, {
        source_message_id: source.id,
        sla_due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      })
    ).rejects.toBeInstanceOf(ForbiddenException);

    const created = await ticketsService.createTicket("main", actor, {
      source_message_id: source.id
    });

    await expect(
      ticketsService.updateTicket("main", created.id, actor, {
        sla_due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns SLA stats for manager role", async () => {
    const { db, ticketsService } = createFixture();
    const now = Date.now();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "ticket_sla_manager",
      priority: 1500,
      isDefault: false,
      permissions: ["ticket.create", "ticket.assign", "ticket.close", "ticket.sla.manage"]
    });

    const actor = await makeRequestUser(db, 940006, "ticket_sla_manager_actor");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);
    const source = await db.createMessage({
      chatId: "main",
      authorId: actor.userId,
      actorUserId: actor.userId,
      displayAuthorType: "user",
      displayAuthorId: actor.userId,
      senderMode: "as_user",
      text: "source message",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    await ticketsService.createTicket("main", actor, {
      source_message_id: source.id,
      sla_due_at: new Date(now - 30 * 60 * 1000).toISOString()
    });
    await ticketsService.createTicket("main", actor, {
      source_message_id: source.id,
      sla_due_at: new Date(now + 20 * 60 * 1000).toISOString()
    });
    const resolved = await ticketsService.createTicket("main", actor, {
      source_message_id: source.id,
      sla_due_at: new Date(now - 90 * 60 * 1000).toISOString()
    });
    await ticketsService.updateTicket("main", resolved.id, actor, { status: "in_progress" });
    await ticketsService.updateTicket("main", resolved.id, actor, { status: "resolved" });

    const stats = await ticketsService.getSlaStats("main", actor, { due_soon_minutes: 60 });
    expect(stats.ok).toBe(true);
    expect(stats.totals.overdue).toBeGreaterThanOrEqual(1);
    expect(stats.totals.dueSoon).toBeGreaterThanOrEqual(1);
    expect(stats.totals.resolvedOrClosed).toBeGreaterThanOrEqual(1);
  });

  it("sweeps due tickets once and writes SLA overdue audit", async () => {
    const { db, eventBus, ticketsService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "ticket_sla_sweeper_setup",
      priority: 1500,
      isDefault: false,
      permissions: ["ticket.create", "ticket.assign", "ticket.close", "ticket.sla.manage"]
    });
    const actor = await makeRequestUser(db, 940007, "ticket_sla_sweeper_actor");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const source = await db.createMessage({
      chatId: "main",
      authorId: actor.userId,
      actorUserId: actor.userId,
      displayAuthorType: "user",
      displayAuthorId: actor.userId,
      senderMode: "as_user",
      text: "source message",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const overdueTicket = await ticketsService.createTicket("main", actor, {
      source_message_id: source.id,
      sla_due_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    });
    await db.updateTicket("main", overdueTicket.id, { slaBreachedAt: null });

    const updates: string[] = [];
    const off = eventBus.on("ticket.updated", (payload) => updates.push(payload.id));

    const firstSweep = await ticketsService.sweepSlaDeadlines(new Date().toISOString());
    const secondSweep = await ticketsService.sweepSlaDeadlines(new Date().toISOString());

    const updatedTicket = await db.getTicket("main", overdueTicket.id);
    expect(firstSweep).toBe(1);
    expect(secondSweep).toBe(0);
    expect(updatedTicket.slaBreachedAt).toBeTruthy();
    expect(updates).toContain(overdueTicket.id);

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("ticket.sla.overdue");
    off();
  });
});
