export type BroadcastJobTrigger = "manual" | "scheduled" | "resume";

export interface BroadcastJobData {
  chatId: string;
  campaignId: string;
  trigger: BroadcastJobTrigger;
  actorId: string;
}
