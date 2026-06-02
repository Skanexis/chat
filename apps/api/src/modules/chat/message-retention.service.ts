import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";

@Injectable()
export class MessageRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageRetentionService.name);
  private intervalHandle?: NodeJS.Timeout;
  private running = false;
  private readonly enabled: boolean;
  private readonly retentionHours: number;
  private readonly intervalMs: number;

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly eventBus: EventBusService,
    private readonly configService: ConfigService
  ) {
    this.enabled = this.parseBoolean(this.configService.get<string>("MESSAGE_RETENTION_ENABLED"), true);
    this.retentionHours = this.parsePositiveNumber(this.configService.get<string>("MESSAGE_RETENTION_HOURS"), 36);
    this.intervalMs =
      this.parsePositiveNumber(this.configService.get<string>("MESSAGE_RETENTION_SWEEP_INTERVAL_SECONDS"), 3600) * 1000;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.sweepExpiredMessages();
    this.intervalHandle = setInterval(() => {
      void this.sweepExpiredMessages();
    }, this.intervalMs);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  async sweepExpiredMessages(now = new Date()): Promise<number> {
    if (this.running) {
      return 0;
    }

    this.running = true;
    try {
      const cutoffIso = new Date(now.getTime() - this.retentionHours * 60 * 60 * 1000).toISOString();
      const batches = await this.db.hardDeleteMessagesOlderThan(cutoffIso);
      let deletedCount = 0;

      for (const batch of batches) {
        deletedCount += batch.messageIds.length;
        await this.db.addAuditLog({
          chatId: batch.chatId,
          actorId: "system",
          action: "message.retention.purge",
          targetType: "chat",
          targetId: batch.chatId,
          payload: {
            deletedCount: batch.messageIds.length,
            cutoff: cutoffIso,
            retentionHours: this.retentionHours
          }
        });
        this.eventBus.emit("message.purged", {
          chatId: batch.chatId,
          messageIds: batch.messageIds
        });
      }

      if (deletedCount > 0) {
        this.logger.log(`Purged ${deletedCount} messages older than ${cutoffIso}.`);
      }
      return deletedCount;
    } finally {
      this.running = false;
    }
  }

  private parsePositiveNumber(rawValue: string | undefined, fallback: number): number {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
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
