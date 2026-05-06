import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type RateEntry = {
  count: number;
  resetAtMs: number;
};

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly bucket = new Map<string, RateEntry>();
  private lastCleanupAtMs = 0;
  private readonly windowSeconds: number;
  private readonly maxAttempts: number;
  private readonly maxBuckets: number;

  constructor(private readonly configService: ConfigService) {
    this.windowSeconds = this.parsePositiveInt(this.configService.get<string>("AUTH_RATE_LIMIT_WINDOW_SECONDS"), 60);
    this.maxAttempts = this.parsePositiveInt(this.configService.get<string>("AUTH_RATE_LIMIT_MAX_ATTEMPTS"), 30);
    this.maxBuckets = this.parsePositiveInt(this.configService.get<string>("AUTH_RATE_LIMIT_MAX_BUCKETS"), 20_000);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
    }>();

    const nowMs = Date.now();
    this.cleanup(nowMs, this.windowSeconds);

    const ip = this.resolveIp(request);
    const key = `auth:ip:${ip}`;
    const existing = this.bucket.get(key);
    if (!existing || existing.resetAtMs <= nowMs) {
      this.bucket.set(key, {
        count: 1,
        resetAtMs: nowMs + this.windowSeconds * 1000
      });
      this.evictOverflowBuckets();
      return true;
    }

    if (existing.count >= this.maxAttempts) {
      throw new HttpException("Too many authentication attempts. Please retry later.", HttpStatus.TOO_MANY_REQUESTS);
    }

    existing.count += 1;
    this.bucket.set(key, existing);
    this.evictOverflowBuckets();
    return true;
  }

  private cleanup(nowMs: number, windowSeconds: number): void {
    const cleanupIntervalMs = Math.max(5, windowSeconds) * 1000;
    if (nowMs - this.lastCleanupAtMs < cleanupIntervalMs) {
      return;
    }
    this.lastCleanupAtMs = nowMs;
    for (const [key, entry] of this.bucket.entries()) {
      if (entry.resetAtMs <= nowMs) {
        this.bucket.delete(key);
      }
    }
  }

  private resolveIp(request: { ip?: string; headers?: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
    const forwarded = request.headers?.["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim().length > 0) {
      return this.normalizeIpKey(forwarded.split(",")[0]!.trim());
    }
    if (Array.isArray(forwarded) && forwarded.length > 0 && forwarded[0]?.trim()) {
      return this.normalizeIpKey(forwarded[0]!.split(",")[0]!.trim());
    }
    const fromReq = request.ip?.trim();
    if (fromReq) {
      return this.normalizeIpKey(fromReq);
    }
    return this.normalizeIpKey(request.socket?.remoteAddress?.trim() || "unknown");
  }

  private evictOverflowBuckets(): void {
    if (this.bucket.size <= this.maxBuckets) {
      return;
    }

    const overLimitCount = this.bucket.size - this.maxBuckets;
    const byResetAsc = Array.from(this.bucket.entries()).sort((a, b) => a[1].resetAtMs - b[1].resetAtMs);
    for (let i = 0; i < overLimitCount; i += 1) {
      const victim = byResetAsc[i];
      if (!victim) {
        break;
      }
      this.bucket.delete(victim[0]);
    }
  }

  private normalizeIpKey(rawIp: string): string {
    const trimmed = rawIp.trim().toLowerCase();
    if (!trimmed) {
      return "unknown";
    }
    if (trimmed.length <= 128) {
      return trimmed;
    }
    return trimmed.slice(0, 128);
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return Math.floor(value);
  }
}
