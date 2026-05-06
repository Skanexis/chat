import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import type {
  CreateAutomationRuleDto,
  ExecuteAutomationRuleDto,
  ListAutomationExecutionsQueryDto,
  UpdateAutomationRuleDto
} from "./automation.dto.js";

const BLOCKED_RECURSION_TOKENS = ["automation.rule.execute", "automation_rule_execute", "rule.execute", "execute_rule"];

@Injectable()
export class AutomationService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly eventBus: EventBusService
  ) {}

  async createRule(chatId: string, requestUser: RequestUser, dto: CreateAutomationRuleDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "automation.rule.create");

    this.assertRuleSafety(dto.trigger, dto.conditions, dto.actions);

    const created = await this.db.createAutomationRule({
      chatId,
      name: dto.name,
      triggerType: dto.trigger,
      conditions: dto.conditions,
      actions: dto.actions,
      isEnabled: dto.is_enabled,
      createdBy: requestUser.userId,
      updatedBy: requestUser.userId
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "automation.rule.create",
      targetType: "automation_rule",
      targetId: created.id,
      payload: dto as unknown as Record<string, unknown>
    });
    return created;
  }

  async updateRule(chatId: string, ruleId: string, requestUser: RequestUser, dto: UpdateAutomationRuleDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "automation.rule.update");

    const current = await this.db.getAutomationRule(chatId, ruleId);
    const trigger = dto.trigger ?? current.triggerType;
    const conditions = dto.conditions ?? current.conditions;
    const actions = dto.actions ?? current.actions;
    this.assertRuleSafety(trigger, conditions, actions);

    const updated = await this.db.updateAutomationRule(chatId, ruleId, {
      name: dto.name,
      triggerType: dto.trigger,
      conditions: dto.conditions,
      actions: dto.actions,
      isEnabled: dto.is_enabled,
      updatedBy: requestUser.userId
    });
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "automation.rule.update",
      targetType: "automation_rule",
      targetId: updated.id,
      payload: dto as unknown as Record<string, unknown>
    });
    return updated;
  }

  async executeRule(chatId: string, ruleId: string, requestUser: RequestUser, dto: ExecuteAutomationRuleDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "automation.rule.execute");

    const rule = await this.db.getAutomationRule(chatId, ruleId);
    if (!rule.isEnabled && !dto.dry_run) {
      throw new BadRequestException("Automation rule is disabled.");
    }

    const inputPayload = dto.input_payload ?? {};
    const startedAt = new Date().toISOString();
    let status: "success" | "failed" | "skipped" = "success";
    let error: string | null = null;
    try {
      const conditionsMet = this.evaluateConditions(rule.conditions, inputPayload);
      if (!conditionsMet) {
        status = "skipped";
        error = "conditions_not_met";
      } else if (dto.dry_run) {
        status = "skipped";
        error = "dry_run";
      } else {
        status = "success";
      }
    } catch (reason) {
      status = "failed";
      error = (reason as Error).message ?? "automation_execution_failed";
    }
    const finishedAt = new Date().toISOString();

    const execution = await this.db.createAutomationExecution({
      chatId,
      ruleId: rule.id,
      triggerType: dto.trigger ?? rule.triggerType,
      inputPayload,
      status,
      actionsCount: Array.isArray(rule.actions) ? rule.actions.length : 0,
      error,
      executedBy: requestUser.userId,
      startedAt,
      finishedAt
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "automation.rule.execute",
      targetType: "automation_rule",
      targetId: rule.id,
      payload: {
        execution_id: execution.id,
        status: execution.status,
        dry_run: Boolean(dto.dry_run),
        trigger: execution.triggerType
      }
    });

    this.eventBus.emit("automation.rule.executed", execution);
    return {
      ok: true,
      execution
    };
  }

  async listExecutions(chatId: string, ruleId: string, requestUser: RequestUser, query: ListAutomationExecutionsQueryDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "automation.rule.execute");
    await this.db.getAutomationRule(chatId, ruleId);

    const limit = query.limit ?? 50;
    const items = await this.db.listAutomationExecutions(chatId, ruleId, limit);
    return {
      ok: true,
      items
    };
  }

  private assertRuleSafety(trigger: string, conditions: unknown[], actions: unknown[]): void {
    if (!Array.isArray(conditions)) {
      throw new BadRequestException("conditions must be an array.");
    }
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new BadRequestException("actions must be a non-empty array.");
    }

    const serializedActions = JSON.stringify(actions).toLowerCase();
    for (const token of BLOCKED_RECURSION_TOKENS) {
      if (serializedActions.includes(token)) {
        throw new BadRequestException("Automation rule contains recursive action pattern.");
      }
    }

    const normalizedTrigger = trigger.toLowerCase();
    for (const action of actions) {
      if (!action || typeof action !== "object") {
        continue;
      }
      const asRecord = action as Record<string, unknown>;
      const actionTrigger = asRecord.trigger ?? asRecord.trigger_type;
      if (typeof actionTrigger === "string" && actionTrigger.toLowerCase() === normalizedTrigger) {
        throw new BadRequestException("Automation rule action trigger cannot recursively target the same trigger.");
      }
    }
  }

  private evaluateConditions(conditions: unknown[], input: Record<string, unknown>): boolean {
    for (const rawCondition of conditions) {
      if (!rawCondition || typeof rawCondition !== "object") {
        continue;
      }

      const condition = rawCondition as Record<string, unknown>;
      const field = typeof condition.field === "string" ? condition.field : null;
      const op = typeof condition.op === "string" ? condition.op : "eq";
      const expected = condition.value;
      if (!field) {
        continue;
      }

      const actual = this.getValueByPath(input, field);
      if (!this.matchCondition(actual, op, expected)) {
        return false;
      }
    }
    return true;
  }

  private getValueByPath(input: Record<string, unknown>, field: string): unknown {
    const parts = field.split(".").filter(Boolean);
    let cursor: unknown = input;
    for (const part of parts) {
      if (!cursor || typeof cursor !== "object") {
        return undefined;
      }
      cursor = (cursor as Record<string, unknown>)[part];
    }
    return cursor;
  }

  private matchCondition(actual: unknown, op: string, expected: unknown): boolean {
    switch (op) {
      case "neq":
        return actual !== expected;
      case "gt":
        return this.toComparableNumber(actual) > this.toComparableNumber(expected);
      case "gte":
        return this.toComparableNumber(actual) >= this.toComparableNumber(expected);
      case "lt":
        return this.toComparableNumber(actual) < this.toComparableNumber(expected);
      case "lte":
        return this.toComparableNumber(actual) <= this.toComparableNumber(expected);
      case "in":
        return Array.isArray(expected) ? expected.includes(actual) : false;
      case "contains":
        return Array.isArray(actual) ? actual.includes(expected) : typeof actual === "string" && typeof expected === "string" ? actual.includes(expected) : false;
      case "eq":
      default:
        return actual === expected;
    }
  }

  private toComparableNumber(value: unknown): number {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return Number.NaN;
  }
}
