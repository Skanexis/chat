import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateThreadSubscriptionDto {
  @IsString()
  message_id!: string;

  @IsOptional()
  @IsIn(["thread", "message"])
  subscription_type?: "thread" | "message";

  @IsOptional()
  @IsBoolean()
  telegram_notify?: boolean;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(24 * 60 * 60)
  dedup_window_seconds?: number;
}

