import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser, TicketStatus } from "../../core/types.js";
import type { CreateTicketDto, GetTicketSlaStatsQueryDto, UpdateTicketDto } from "./tickets.dto.js";

const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "closed"],
  in_progress: ["waiting", "resolved", "closed"],
  waiting: ["in_progress", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: []
};
const ACTIVE_TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "waiting"];

@Injectable()
export class TicketsService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly eventBus: EventBusService
  ) {}

  async createTicket(chatId: string, requestUser: RequestUser, dto: CreateTicketDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "ticket.create");

    await this.db.getMessage(chatId, dto.source_message_id);

    if (dto.assignee_id !== undefined) {
      await this.policy.assertCan(chatId, actor, "ticket.assign");
      await this.db.ensureMember(chatId, dto.assignee_id);
    }
    if (dto.sla_due_at !== undefined) {
      await this.policy.assertCan(chatId, actor, "ticket.sla.manage");
    }

    const slaDueAt = this.normalizeDueAt(dto.sla_due_at);
    const nowIso = new Date().toISOString();

    const created = await this.db.createTicket({
      chatId,
      sourceMessageId: dto.source_message_id,
      status: "open",
      priority: dto.priority ?? "normal",
      assigneeId: dto.assignee_id ?? null,
      slaDueAt,
      slaBreachedAt: this.computeSlaBreachedAt("open", slaDueAt ?? null, null, nowIso),
      labels: dto.labels ?? [],
      createdBy: requestUser.userId
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "ticket.create",
      targetType: "ticket",
      targetId: created.id,
      payload: dto as unknown as Record<string, unknown>
    });
    this.eventBus.emit("ticket.updated", created);
    return created;
  }

  async updateTicket(chatId: string, ticketId: string, requestUser: RequestUser, dto: UpdateTicketDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);

    const current = await this.db.getTicket(chatId, ticketId);
    this.assertHasPatch(dto);

    if (dto.status !== undefined) {
      this.assertStatusTransition(current.status, dto.status);
      if (dto.status === "closed") {
        await this.policy.assertCan(chatId, actor, "ticket.close");
      } else {
        await this.policy.assertCan(chatId, actor, "ticket.assign");
      }
    }

    const hasNonStatusPatch =
      dto.priority !== undefined || dto.assignee_id !== undefined || dto.sla_due_at !== undefined || dto.labels !== undefined;
    if (hasNonStatusPatch) {
      await this.policy.assertCan(chatId, actor, "ticket.assign");
    }
    if (dto.sla_due_at !== undefined) {
      await this.policy.assertCan(chatId, actor, "ticket.sla.manage");
    }

    if (dto.assignee_id !== undefined && dto.assignee_id !== null) {
      await this.db.ensureMember(chatId, dto.assignee_id);
    }

    const nowIso = new Date().toISOString();
    const nextStatus = dto.status ?? current.status;
    const nextSlaDueAt = this.normalizeDueAt(dto.sla_due_at);
    const effectiveSlaDueAt = nextSlaDueAt !== undefined ? nextSlaDueAt : current.slaDueAt;
    const nextSlaBreachedAt = this.computeSlaBreachedAt(nextStatus, effectiveSlaDueAt ?? null, current.slaBreachedAt ?? null, nowIso);

    const updated = await this.db.updateTicket(chatId, ticketId, {
      status: dto.status,
      priority: dto.priority,
      assigneeId: dto.assignee_id,
      slaDueAt: nextSlaDueAt,
      slaBreachedAt: nextSlaBreachedAt,
      labels: dto.labels
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "ticket.update",
      targetType: "ticket",
      targetId: updated.id,
      payload: {
        before: {
          status: current.status,
          priority: current.priority,
          assigneeId: current.assigneeId,
          slaDueAt: current.slaDueAt,
          slaBreachedAt: current.slaBreachedAt,
          labels: current.labels
        },
        patch: dto
      }
    });
    this.eventBus.emit("ticket.updated", updated);
    return updated;
  }

  async getSlaStats(chatId: string, requestUser: RequestUser, query: GetTicketSlaStatsQueryDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "ticket.sla.manage");

    const dueSoonMinutes = query.due_soon_minutes ?? 60;
    const nowTs = Date.now();
    const dueSoonUntilTs = nowTs + dueSoonMinutes * 60 * 1000;
    const tickets = await this.db.listTickets(chatId);

    const activeWithSla = tickets.filter((ticket) => this.isActiveStatus(ticket.status) && ticket.slaDueAt !== null && ticket.slaDueAt !== undefined);
    const overdue = activeWithSla.filter((ticket) => Date.parse(ticket.slaDueAt as string) <= nowTs);
    const dueSoon = activeWithSla.filter((ticket) => {
      const dueTs = Date.parse(ticket.slaDueAt as string);
      return dueTs > nowTs && dueTs <= dueSoonUntilTs;
    });
    const breachedActive = activeWithSla.filter((ticket) => ticket.slaBreachedAt !== null && ticket.slaBreachedAt !== undefined);
    const resolvedOrClosed = tickets.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed");
    const resolvedOrClosedBreached = resolvedOrClosed.filter(
      (ticket) => ticket.slaBreachedAt !== null && ticket.slaBreachedAt !== undefined
    );

    return {
      ok: true,
      generatedAt: new Date(nowTs).toISOString(),
      dueSoonMinutes,
      totals: {
        all: tickets.length,
        activeWithSla: activeWithSla.length,
        overdue: overdue.length,
        dueSoon: dueSoon.length,
        breachedActive: breachedActive.length,
        resolvedOrClosed: resolvedOrClosed.length,
        resolvedOrClosedBreached: resolvedOrClosedBreached.length
      }
    };
  }

  async sweepSlaDeadlines(nowIso = new Date().toISOString()): Promise<number> {
    const due = await this.db.listTicketsPendingSlaBreach(nowIso);
    let breached = 0;

    for (const ticket of due) {
      const updated = await this.db.updateTicket(ticket.chatId, ticket.id, {
        slaBreachedAt: nowIso
      });
      await this.db.addAuditLog({
        chatId: ticket.chatId,
        actorId: "system",
        action: "ticket.sla.overdue",
        targetType: "ticket",
        targetId: ticket.id,
        payload: {
          sla_due_at: ticket.slaDueAt,
          sla_breached_at: nowIso
        }
      });
      this.eventBus.emit("ticket.updated", updated);
      breached += 1;
    }

    return breached;
  }

  private assertHasPatch(dto: UpdateTicketDto): void {
    const hasPatch =
      dto.status !== undefined ||
      dto.priority !== undefined ||
      dto.assignee_id !== undefined ||
      dto.sla_due_at !== undefined ||
      dto.labels !== undefined;
    if (!hasPatch) {
      throw new BadRequestException("Ticket update requires at least one field.");
    }
  }

  private assertStatusTransition(from: TicketStatus, to: TicketStatus): void {
    if (from === to) {
      return;
    }

    const allowed = TICKET_STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(`Invalid ticket status transition: ${from} -> ${to}`);
    }
  }

  private normalizeDueAt(value?: string | null): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (Number.isNaN(Date.parse(value))) {
      throw new BadRequestException("sla_due_at must be a valid ISO datetime.");
    }
    return new Date(value).toISOString();
  }

  private computeSlaBreachedAt(
    status: TicketStatus,
    slaDueAt: string | null,
    currentSlaBreachedAt: string | null,
    nowIso: string
  ): string | null {
    if (!this.isActiveStatus(status)) {
      return currentSlaBreachedAt;
    }
    if (!slaDueAt) {
      return null;
    }
    if (slaDueAt > nowIso) {
      return null;
    }
    return currentSlaBreachedAt ?? nowIso;
  }

  private isActiveStatus(status: TicketStatus): boolean {
    return ACTIVE_TICKET_STATUSES.includes(status);
  }
}
