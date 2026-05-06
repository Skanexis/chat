import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { TicketsService } from "./tickets.service.js";

@Injectable()
export class TicketsSlaWorkerService implements OnModuleInit, OnModuleDestroy {
  private intervalHandle?: NodeJS.Timeout;
  private running = false;
  private readonly enabled: boolean;
  private readonly intervalMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly ticketsService: TicketsService
  ) {
    this.enabled = this.parseBoolean(this.configService.get<string>("TICKET_SLA_SWEEPER_ENABLED"), true);
    this.intervalMs = this.parsePositiveInt(this.configService.get<string>("TICKET_SLA_SWEEPER_INTERVAL_SECONDS"), 30) * 1000;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.runSweep();
    this.intervalHandle = setInterval(() => {
      void this.runSweep();
    }, this.intervalMs);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  private async runSweep(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      await this.ticketsService.sweepSlaDeadlines();
    } finally {
      this.running = false;
    }
  }

  private parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private parseBoolean(rawValue: string | undefined, fallback: boolean): boolean {
    if (rawValue === undefined) {
      return fallback;
    }
    const normalized = rawValue.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
    return fallback;
  }
}
