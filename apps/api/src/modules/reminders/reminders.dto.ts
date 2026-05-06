import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

import type { ReminderStatus, ReminderType } from "../../core/types.js";

export class CreateReminderDto {
  @IsString()
  @MaxLength(64)
  message_id!: string;

  @IsString()
  remind_at!: string;

  @IsOptional()
  @IsIn(["personal", "team", "moderator"])
  reminder_type?: ReminderType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  target_role_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  telegram_notify?: boolean;
}

export class ListRemindersQueryDto {
  @IsOptional()
  @IsIn(["scheduled", "sent", "failed", "canceled"])
  status?: ReminderStatus;
}

export class CancelReminderDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
