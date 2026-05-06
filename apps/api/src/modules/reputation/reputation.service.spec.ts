import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { ReputationService } from "./reputation.service.js";

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
  const reputationService = new ReputationService(db, policy, eventBus);
  return { db, eventBus, reputationService };
}

describe("ReputationService", () => {
  it("adjusts reputation, computes score, writes audit and emits event", async () => {
    const { db, eventBus, reputationService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "reputation_operator",
      priority: 1400,
      isDefault: false,
      permissions: ["reputation.adjust"]
    });

    const actor = await makeRequestUser(db, 990001, "rep_actor");
    const target = await makeRequestUser(db, 990002, "rep_target");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const scores: number[] = [];
    const off = eventBus.on("reputation.updated", (payload) => scores.push(payload.score));

    const first = await reputationService.adjust("main", actor, {
      user_id: target.userId,
      delta: 7,
      reason: "Helpful answer"
    });
    expect(first.ok).toBe(true);
    expect(first.score).toBe(7);

    const second = await reputationService.adjust("main", actor, {
      user_id: target.userId,
      delta: -2,
      reason: "Spam warning",
      source_type: "moderation",
      source_id: "case-1"
    });
    expect(second.score).toBe(5);
    expect(scores).toEqual([7, 5]);

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("reputation.adjust");

    off();
  });

  it("denies adjust without permission", async () => {
    const { db, reputationService } = createFixture();
    const actor = await makeRequestUser(db, 990003, "rep_member");
    const target = await makeRequestUser(db, 990004, "rep_target_2");

    await expect(
      reputationService.adjust("main", actor, {
        user_id: target.userId,
        delta: 1,
        reason: "Denied"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns not found when target member is absent in chat", async () => {
    const { db, reputationService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "reputation_operator_not_found",
      priority: 1400,
      isDefault: false,
      permissions: ["reputation.adjust"]
    });
    const actor = await makeRequestUser(db, 990005, "rep_actor_not_found");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    await expect(
      reputationService.adjust("main", actor, {
        user_id: "missing-member",
        delta: 3,
        reason: "not-found"
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
