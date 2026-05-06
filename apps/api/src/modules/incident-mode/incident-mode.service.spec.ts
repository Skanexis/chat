import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { IncidentModeService } from "./incident-mode.service.js";

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
  const incidentService = new IncidentModeService(db, policy, eventBus);
  return { db, eventBus, incidentService };
}

describe("IncidentModeService", () => {
  it("enables and disables incident mode with audit and ws events", async () => {
    const { db, eventBus, incidentService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "incident_operator",
      priority: 1600,
      isDefault: false,
      permissions: ["incident_mode.enable", "incident_mode.disable", "incident_mode.policy.edit"]
    });
    const actor = await makeRequestUser(db, 960001, "incident_actor");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const states: boolean[] = [];
    const off = eventBus.on("incident_mode.changed", (payload) => states.push(payload.enabled));

    const enabled = await incidentService.enable("main", actor, {
      reason: "spam spike",
      policy_snapshot_json: {
        pre_moderation_enabled: true,
        links_blocked: true
      }
    });
    expect(enabled.ok).toBe(true);
    expect(enabled.state.disabledAt).toBeNull();

    const disabled = await incidentService.disable("main", actor, {
      reason: "stabilized"
    });
    expect(disabled.ok).toBe(true);
    expect(disabled.state.disabledAt).not.toBeNull();
    expect(states).toEqual([true, false]);

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("incident_mode.enable");
    expect(actions).toContain("incident_mode.disable");

    off();
  });

  it("denies incident mode enable for member without permissions", async () => {
    const { db, incidentService } = createFixture();
    const member = await makeRequestUser(db, 960002, "plain_member");

    await expect(
      incidentService.enable("main", member, {
        reason: "no access"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects double enable while incident mode is active", async () => {
    const { db, incidentService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "incident_enable_only",
      priority: 1600,
      isDefault: false,
      permissions: ["incident_mode.enable"]
    });
    const actor = await makeRequestUser(db, 960003, "incident_enable_actor");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    await incidentService.enable("main", actor, {
      reason: "first enable"
    });

    await expect(
      incidentService.enable("main", actor, {
        reason: "second enable"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("auto-rolls back expired incident mode by configured threshold", async () => {
    const { db, eventBus, incidentService } = createFixture();
    const actor = await makeRequestUser(db, 960004, "incident_auto_actor");
    const enabledAt = new Date(Date.now() - 61 * 60 * 1000).toISOString();

    await db.createIncidentModeLog({
      chatId: "main",
      enabledBy: actor.userId,
      enabledAt,
      disabledAt: null,
      policySnapshot: { pre_moderation_enabled: true },
      reason: "auto test"
    });

    const states: boolean[] = [];
    const off = eventBus.on("incident_mode.changed", (payload) => states.push(payload.enabled));

    const rolledBack = await incidentService.autoRollbackExpired(new Date().toISOString(), 60);
    expect(rolledBack).toBe(1);

    const active = await db.getActiveIncidentMode("main");
    expect(active).toBeUndefined();
    expect(states).toEqual([false]);

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("incident_mode.auto_rollback");

    off();
  });
});
