import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import type { BroadcastCampaign } from "../../core/types.js";
import { BroadcastExecutionService } from "./broadcast-execution.service.js";
import type { BroadcastJobData } from "./broadcasts.types.js";

type QueueDriver = "inmemory" | "bullmq";
type DeadLetterPayload = BroadcastJobData & { error: string; failedAt: string };

@Injectable()
export class BroadcastQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly configuredDriver: QueueDriver;
  private activeDriver: QueueDriver = "inmemory";
  private readonly queueName: string;
  private readonly workerConcurrency: number;
  private readonly maxJobsPerWindow: number;
  private readonly windowMs: number;
  private readonly attempts: number;
  private readonly backoffMs: number;
  private readonly timers = new Map<string, NodeJS.Timeout>();

  private connection?: IORedis;
  private queue?: Queue<BroadcastJobData>;
  private deadLetterQueue?: Queue<DeadLetterPayload>;
  private worker?: Worker<BroadcastJobData>;

  constructor(
    private readonly configService: ConfigService,
    private readonly execution: BroadcastExecutionService
  ) {
    this.configuredDriver = this.parseDriver(configService.get<string>("BROADCAST_QUEUE_DRIVER", "inmemory"));
    this.queueName = configService.get<string>("BROADCAST_QUEUE_NAME", "broadcast_campaigns") ?? "broadcast_campaigns";
    this.workerConcurrency = Number(configService.get<string>("BROADCAST_QUEUE_WORKER_CONCURRENCY", "4"));
    this.maxJobsPerWindow = Number(configService.get<string>("BROADCAST_QUEUE_MAX_JOBS_PER_WINDOW", "120"));
    this.windowMs = Number(configService.get<string>("BROADCAST_QUEUE_WINDOW_MS", "60000"));
    this.attempts = Number(configService.get<string>("BROADCAST_QUEUE_ATTEMPTS", "3"));
    this.backoffMs = Number(configService.get<string>("BROADCAST_QUEUE_BACKOFF_MS", "1000"));
  }

  async onModuleInit(): Promise<void> {
    if (this.configuredDriver !== "bullmq") {
      this.activeDriver = "inmemory";
      return;
    }

    const redisUrl = this.configService.get<string>("REDIS_URL", "redis://localhost:6379") ?? "redis://localhost:6379";

    try {
      this.connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
        retryStrategy: () => null
      });
      this.connection.on("error", () => {
        // Swallow connection errors here; fallback decision is made by init probe.
      });
      await this.connection.connect();
      await this.connection.ping();

      this.queue = new Queue<BroadcastJobData>(this.queueName, {
        connection: this.connection
      });
      this.deadLetterQueue = new Queue<DeadLetterPayload>(`${this.queueName}:dead_letter`, {
        connection: this.connection
      });
      this.worker = new Worker<BroadcastJobData>(
        this.queueName,
        async (job) => {
          await this.execution.execute(job.data);
        },
        {
          connection: this.connection,
          concurrency: this.workerConcurrency,
          limiter: {
            max: this.maxJobsPerWindow,
            duration: this.windowMs
          }
        }
      );

      this.worker.on("failed", (job, error) => {
        if (!job) {
          return;
        }
        void this.pushDeadLetterIfNeeded(job, error);
      });

      this.activeDriver = "bullmq";
    } catch {
      await this.closeBullmq();
      this.activeDriver = "inmemory";
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    await this.closeBullmq();
  }

  async enqueueScheduled(campaign: BroadcastCampaign, data: BroadcastJobData): Promise<void> {
    if (this.activeDriver === "bullmq") {
      await this.enqueueBullmq(campaign, data, false);
      return;
    }
    this.enqueueInMemory(campaign, data, false);
  }

  async enqueueNow(campaign: BroadcastCampaign, data: BroadcastJobData): Promise<void> {
    if (this.activeDriver === "bullmq") {
      await this.enqueueBullmq(campaign, data, true);
      return;
    }
    this.enqueueInMemory(campaign, data, true);
  }

  async cancel(campaignId: string): Promise<void> {
    const timer = this.timers.get(campaignId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(campaignId);
    }

    if (!this.queue) {
      return;
    }
    const job = await this.queue.getJob(this.buildJobId(campaignId));
    if (job) {
      await job.remove();
    }
  }

  private enqueueInMemory(campaign: BroadcastCampaign, data: BroadcastJobData, immediate: boolean): void {
    void this.cancel(campaign.id);

    const execute = () => {
      this.timers.delete(campaign.id);
      void this.execution.execute(data);
    };

    if (immediate) {
      const timer = setTimeout(execute, 0);
      this.timers.set(campaign.id, timer);
      return;
    }

    const runAt = campaign.schedule.at ? Date.parse(campaign.schedule.at) : NaN;
    if (!Number.isFinite(runAt) || runAt <= Date.now()) {
      const timer = setTimeout(execute, 0);
      this.timers.set(campaign.id, timer);
      return;
    }

    const delay = runAt - Date.now();
    const timer = setTimeout(execute, delay);
    this.timers.set(campaign.id, timer);
  }

  private async enqueueBullmq(campaign: BroadcastCampaign, data: BroadcastJobData, immediate: boolean): Promise<void> {
    if (!this.queue) {
      this.enqueueInMemory(campaign, data, immediate);
      return;
    }

    await this.cancel(campaign.id);

    let delay = 0;
    if (!immediate) {
      const runAt = campaign.schedule.at ? Date.parse(campaign.schedule.at) : NaN;
      if (Number.isFinite(runAt) && runAt > Date.now()) {
        delay = runAt - Date.now();
      }
    }

    await this.queue.add("broadcast.execute", data, {
      jobId: this.buildJobId(campaign.id),
      delay,
      attempts: this.attempts,
      backoff: {
        type: "exponential",
        delay: this.backoffMs
      },
      removeOnComplete: 1000,
      removeOnFail: 1000
    });
  }

  private async pushDeadLetterIfNeeded(job: Job<BroadcastJobData>, error: Error): Promise<void> {
    if (!this.deadLetterQueue) {
      return;
    }

    const configuredAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
    if (job.attemptsMade < configuredAttempts) {
      return;
    }

    await this.deadLetterQueue.add(
      "broadcast.dead_letter",
      {
        ...job.data,
        error: error.message,
        failedAt: new Date().toISOString()
      },
      {
        removeOnComplete: 1000,
        removeOnFail: 1000
      }
    );
  }

  private buildJobId(campaignId: string): string {
    return `broadcast:${campaignId}`;
  }

  private parseDriver(rawValue: string | undefined): QueueDriver {
    const normalized = (rawValue ?? "inmemory").toLowerCase();
    return normalized === "bullmq" ? "bullmq" : "inmemory";
  }

  private async closeBullmq(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.deadLetterQueue?.close();
    if (this.connection?.status === "ready") {
      await this.connection.quit();
    } else {
      this.connection?.disconnect();
    }
    this.worker = undefined;
    this.queue = undefined;
    this.deadLetterQueue = undefined;
    this.connection = undefined;
  }
}
