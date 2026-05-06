import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import IORedis from "ioredis";
import { createHash } from "node:crypto";

type ReplayStoreDriver = "memory" | "redis";

@Injectable()
export class AuthReplayStoreService implements OnModuleInit, OnModuleDestroy {
  private activeDriver: ReplayStoreDriver = "memory";
  private connection?: IORedis;
  private readonly memoryBucket = new Map<string, number>();
  private memoryLastCleanupAtMs = 0;
  private readonly memoryMaxKeys: number;

  constructor(private readonly configService: ConfigService) {
    this.memoryMaxKeys = this.parsePositiveInt(
      this.configService.get<string>("AUTH_REPLAY_MEMORY_MAX_KEYS"),
      200_000
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.shouldUseRedis()) {
      this.activeDriver = "memory";
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
        // Connection errors are handled by markIfFirstUse fallback logic.
      });
      await this.connection.connect();
      await this.connection.ping();
      this.activeDriver = "redis";
    } catch {
      await this.closeRedis();
      this.activeDriver = "memory";
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeRedis();
  }

  async markIfFirstUse(rawKey: string, ttlSeconds: number): Promise<boolean> {
    const key = `${this.resolveKeyPrefix()}${this.hashReplayKey(rawKey)}`;
    const normalizedTtlSeconds = this.normalizeTtlSeconds(ttlSeconds);
    if (this.activeDriver === "redis" && this.connection) {
      try {
        const result = await this.connection.set(key, "1", "EX", normalizedTtlSeconds, "NX");
        return result === "OK";
      } catch {
        await this.closeRedis();
        this.activeDriver = "memory";
      }
    }

    return this.markInMemory(key, normalizedTtlSeconds);
  }

  private shouldUseRedis(): boolean {
    const mode = (this.configService.get<string>("AUTH_REPLAY_STORE_DRIVER", "auto") ?? "auto").trim().toLowerCase();
    if (mode === "memory") {
      return false;
    }
    if (mode === "redis") {
      return true;
    }

    const redisUrl = this.configService.get<string>("REDIS_URL", "");
    return Boolean(redisUrl && redisUrl.trim().length > 0);
  }

  private resolveKeyPrefix(): string {
    const rawPrefix = this.configService.get<string>("AUTH_REPLAY_KEY_PREFIX", "auth:replay:");
    if (!rawPrefix || rawPrefix.trim().length === 0) {
      return "auth:replay:";
    }
    return rawPrefix;
  }

  private normalizeTtlSeconds(ttlSeconds: number): number {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      return 1;
    }
    return Math.max(1, Math.floor(ttlSeconds));
  }

  private hashReplayKey(rawKey: string): string {
    return createHash("sha256").update(rawKey).digest("hex");
  }

  private markInMemory(key: string, ttlSeconds: number): boolean {
    const nowMs = Date.now();
    this.cleanupMemory(nowMs);

    const existingExpiry = this.memoryBucket.get(key);
    if (existingExpiry !== undefined && existingExpiry > nowMs) {
      return false;
    }

    this.memoryBucket.set(key, nowMs + ttlSeconds * 1000);
    this.evictOverflowMemoryKeys();
    return true;
  }

  private cleanupMemory(nowMs: number): void {
    const cleanupIntervalSeconds = this.resolveCleanupIntervalSeconds();
    const cleanupIntervalMs = cleanupIntervalSeconds * 1000;
    if (nowMs - this.memoryLastCleanupAtMs < cleanupIntervalMs) {
      return;
    }

    this.memoryLastCleanupAtMs = nowMs;
    for (const [key, expiryMs] of this.memoryBucket.entries()) {
      if (expiryMs <= nowMs) {
        this.memoryBucket.delete(key);
      }
    }
  }

  private resolveCleanupIntervalSeconds(): number {
    const unified = this.parseOptionalPositiveInt(
      this.configService.get<string>("AUTH_REPLAY_MEMORY_CLEANUP_INTERVAL_SECONDS")
    );
    if (unified !== null) {
      return unified;
    }

    const legacyInitData = this.parseOptionalPositiveInt(
      this.configService.get<string>("TELEGRAM_INITDATA_REPLAY_CLEANUP_INTERVAL_SECONDS")
    );
    const legacyRefresh = this.parseOptionalPositiveInt(
      this.configService.get<string>("JWT_REFRESH_REPLAY_CLEANUP_INTERVAL_SECONDS")
    );
    if (legacyInitData !== null && legacyRefresh !== null) {
      return Math.min(legacyInitData, legacyRefresh);
    }
    if (legacyInitData !== null) {
      return legacyInitData;
    }
    if (legacyRefresh !== null) {
      return legacyRefresh;
    }

    return 60;
  }

  private evictOverflowMemoryKeys(): void {
    if (this.memoryBucket.size <= this.memoryMaxKeys) {
      return;
    }

    const overflow = this.memoryBucket.size - this.memoryMaxKeys;
    const byExpiryAsc = Array.from(this.memoryBucket.entries()).sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < overflow; i += 1) {
      const victim = byExpiryAsc[i];
      if (!victim) {
        break;
      }
      this.memoryBucket.delete(victim[0]);
    }
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private parseOptionalPositiveInt(raw: string | undefined): number | null {
    if (!raw || raw.trim().length === 0) {
      return null;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return Math.floor(parsed);
  }

  private async closeRedis(): Promise<void> {
    if (!this.connection) {
      return;
    }
    if (this.connection.status === "ready") {
      await this.connection.quit();
    } else {
      this.connection.disconnect();
    }
    this.connection = undefined;
  }
}
