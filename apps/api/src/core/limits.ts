import type { LimitExceedAction, RoleLimits } from "./types.js";

export const DEFAULT_LIMIT_EXCEED_ACTION: LimitExceedAction = "reject";

export function createDefaultRoleLimits(chatId: string, roleId: string, updatedAt = new Date().toISOString()): RoleLimits {
  return {
    chatId,
    roleId,
    slowmodeSeconds: 0,
    messagesPerDay: null,
    messagesPerHour: null,
    mediaPerDay: null,
    linksPerDay: null,
    mentionsPerDay: null,
    burstCount: null,
    burstWindowSeconds: null,
    exceedAction: DEFAULT_LIMIT_EXCEED_ACTION,
    exceedMuteSeconds: null,
    updatedAt
  };
}
