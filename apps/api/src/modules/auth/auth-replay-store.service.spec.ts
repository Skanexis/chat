import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it } from "vitest";

import { AuthReplayStoreService } from "./auth-replay-store.service.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMemoryBucketSize(store: AuthReplayStoreService): number {
  const internal = store as unknown as { memoryBucket: Map<string, number> };
  return internal.memoryBucket.size;
}

describe("AuthReplayStoreService", () => {
  const storesToDestroy: AuthReplayStoreService[] = [];

  afterEach(async () => {
    while (storesToDestroy.length > 0) {
      const store = storesToDestroy.pop();
      if (store) {
        await store.onModuleDestroy();
      }
    }
  });

  it("enforces single-use semantics in memory mode", async () => {
    const store = new AuthReplayStoreService(
      new ConfigService({
        AUTH_REPLAY_STORE_DRIVER: "memory"
      })
    );
    storesToDestroy.push(store);

    await store.onModuleInit();
    await expect(store.markIfFirstUse("token-1", 30)).resolves.toBe(true);
    await expect(store.markIfFirstUse("token-1", 30)).resolves.toBe(false);
  });

  it("allows key reuse after ttl expires", async () => {
    const store = new AuthReplayStoreService(
      new ConfigService({
        AUTH_REPLAY_STORE_DRIVER: "memory"
      })
    );
    storesToDestroy.push(store);

    await store.onModuleInit();
    await expect(store.markIfFirstUse("ttl-key", 1)).resolves.toBe(true);
    await expect(store.markIfFirstUse("ttl-key", 1)).resolves.toBe(false);
    await sleep(1100);
    await expect(store.markIfFirstUse("ttl-key", 1)).resolves.toBe(true);
  });

  it("uses legacy cleanup interval env as fallback", async () => {
    const store = new AuthReplayStoreService(
      new ConfigService({
        AUTH_REPLAY_STORE_DRIVER: "memory",
        TELEGRAM_INITDATA_REPLAY_CLEANUP_INTERVAL_SECONDS: "1"
      })
    );
    storesToDestroy.push(store);

    await store.onModuleInit();
    await expect(store.markIfFirstUse("legacy-a", 1)).resolves.toBe(true);
    expect(getMemoryBucketSize(store)).toBe(1);

    await sleep(1100);
    await expect(store.markIfFirstUse("legacy-b", 1)).resolves.toBe(true);
    expect(getMemoryBucketSize(store)).toBe(1);
  });

  it("prefers unified cleanup interval env over legacy values", async () => {
    const store = new AuthReplayStoreService(
      new ConfigService({
        AUTH_REPLAY_STORE_DRIVER: "memory",
        AUTH_REPLAY_MEMORY_CLEANUP_INTERVAL_SECONDS: "60",
        TELEGRAM_INITDATA_REPLAY_CLEANUP_INTERVAL_SECONDS: "1",
        JWT_REFRESH_REPLAY_CLEANUP_INTERVAL_SECONDS: "1"
      })
    );
    storesToDestroy.push(store);

    await store.onModuleInit();
    await expect(store.markIfFirstUse("precedence-a", 1)).resolves.toBe(true);
    expect(getMemoryBucketSize(store)).toBe(1);

    await sleep(1100);
    await expect(store.markIfFirstUse("precedence-b", 1)).resolves.toBe(true);
    expect(getMemoryBucketSize(store)).toBe(2);
  });

  it("evicts oldest entries when memory key cap is reached", async () => {
    const store = new AuthReplayStoreService(
      new ConfigService({
        AUTH_REPLAY_STORE_DRIVER: "memory",
        AUTH_REPLAY_MEMORY_MAX_KEYS: "2",
        AUTH_REPLAY_MEMORY_CLEANUP_INTERVAL_SECONDS: "3600"
      })
    );
    storesToDestroy.push(store);

    await store.onModuleInit();
    await expect(store.markIfFirstUse("key-a", 60)).resolves.toBe(true);
    await expect(store.markIfFirstUse("key-b", 60)).resolves.toBe(true);
    await expect(store.markIfFirstUse("key-c", 60)).resolves.toBe(true);
    expect(getMemoryBucketSize(store)).toBe(2);

    await expect(store.markIfFirstUse("key-a", 60)).resolves.toBe(true);
    expect(getMemoryBucketSize(store)).toBe(2);
  });
});
