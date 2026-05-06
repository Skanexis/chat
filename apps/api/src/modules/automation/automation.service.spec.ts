import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { AutomationService } from "./automation.service.js";

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
  const automationService = new AutomationService(db, policy, eventBus);
  return { db, eventBus, automationService };
}

describe("AutomationService", () => {
  it("creates and updates automation rule with audit logs", async () => {
    const { db, automationService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "automation_operator",
      priority: 1400,
      isDefault: false,
      permissions: ["automation.rule.create", "automation.rule.update"]
    });
    const actor = await makeRequestUser(db, 950001, "automation_actor");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const created = await automationService.createRule("main", actor, {
      name: "Auto onboarding",
      trigger: "member.joined",
      conditions: [{ field: "member.age_days", op: "lte", value: 1 }],
      actions: [{ type: "message.send", template: "welcome" }],
      is_enabled: true
    });
    expect(created.triggerType).toBe("member.joined");
    expect(created.isEnabled).toBe(true);

    const updated = await automationService.updateRule("main", created.id, actor, {
      is_enabled: false,
      actions: [{ type: "tag.assign", tag: "newbie" }]
    });
    expect(updated.isEnabled).toBe(false);
    expect(updated.actions).toEqual([{ type: "tag.assign", tag: "newbie" }]);

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("automation.rule.create");
    expect(actions).toContain("automation.rule.update");
  });

  it("denies create without automation.rule.create permission", async () => {
    const { db, automationService } = createFixture();
    const member = await makeRequestUser(db, 950002, "plain_member");

    await expect(
      automationService.createRule("main", member, {
        name: "Denied rule",
        trigger: "message.created",
        conditions: [],
        actions: [{ type: "message.send" }],
        is_enabled: true
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects recursive action patterns", async () => {
    const { db, automationService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "automation_guard",
      priority: 1400,
      isDefault: false,
      permissions: ["automation.rule.create"]
    });
    const actor = await makeRequestUser(db, 950003, "automation_guard_actor");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    await expect(
      automationService.createRule("main", actor, {
        name: "Looping rule",
        trigger: "message.created",
        conditions: [],
        actions: [{ type: "automation.rule.execute", rule_id: "self" }],
        is_enabled: true
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("executes rule, writes execution log and emits event", async () => {
    const { db, eventBus, automationService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "automation_executor",
      priority: 1400,
      isDefault: false,
      permissions: ["automation.rule.create", "automation.rule.execute"]
    });
    const actor = await makeRequestUser(db, 950004, "automation_executor_actor");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const created = await automationService.createRule("main", actor, {
      name: "Message threshold",
      trigger: "message.created",
      conditions: [{ field: "meta.count", op: "gte", value: 2 }],
      actions: [{ type: "ticket.create" }],
      is_enabled: true
    });

    const states: string[] = [];
    const off = eventBus.on("automation.rule.executed", (payload) => states.push(payload.status));

    const skipped = await automationService.executeRule("main", created.id, actor, {
      input_payload: { meta: { count: 1 } }
    });
    expect(skipped.execution.status).toBe("skipped");

    const executed = await automationService.executeRule("main", created.id, actor, {
      input_payload: { meta: { count: 3 } }
    });
    expect(executed.execution.status).toBe("success");

    const listed = await automationService.listExecutions("main", created.id, actor, { limit: 10 });
    expect(listed.items.length).toBeGreaterThanOrEqual(2);
    expect(states).toEqual(["skipped", "success"]);

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("automation.rule.execute");
    off();
  });

  it("denies execute without automation.rule.execute permission", async () => {
    const { db, automationService } = createFixture();
    const createOnlyRole = await db.createRole({
      chatId: "main",
      name: "automation_create_only",
      priority: 1400,
      isDefault: false,
      permissions: ["automation.rule.create"]
    });
    const actor = await makeRequestUser(db, 950005, "automation_create_only_actor");
    await db.updateMemberRole("main", actor.userId, createOnlyRole.id);

    const created = await automationService.createRule("main", actor, {
      name: "Denied execute rule",
      trigger: "message.created",
      conditions: [],
      actions: [{ type: "message.send" }],
      is_enabled: true
    });

    await expect(
      automationService.executeRule("main", created.id, actor, {
        input_payload: {}
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
