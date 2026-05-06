import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

class BroadcastAudienceDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  statuses?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  inactive_days_gte?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locale?: string[];
}

class BroadcastContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  media?: unknown;

  @IsOptional()
  @IsArray()
  buttons?: unknown[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  template_id?: string;
}

class BroadcastScheduleDto {
  @IsOptional()
  @IsString()
  at?: string;

  @IsOptional()
  @IsString()
  cron?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  timezone!: string;
}

export class CreateBroadcastDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsIn(["scheduled", "recurring", "event_triggered", "digest"])
  broadcast_type!: "scheduled" | "recurring" | "event_triggered" | "digest";

  @IsObject()
  @ValidateNested()
  @Type(() => BroadcastAudienceDto)
  audience!: BroadcastAudienceDto;

  @IsObject()
  @ValidateNested()
  @Type(() => BroadcastContentDto)
  content!: BroadcastContentDto;

  @IsObject()
  @ValidateNested()
  @Type(() => BroadcastScheduleDto)
  schedule!: BroadcastScheduleDto;

  @IsIn(["as_user", "as_group", "as_role_profile"])
  sender_mode!: "as_user" | "as_group" | "as_role_profile";

  @IsOptional()
  @IsString()
  identity_id?: string;

  @IsOptional()
  @IsBoolean()
  requires_approval?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  rate_limit_per_minute?: number;
}

export class UpdateBroadcastDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(["scheduled", "recurring", "event_triggered", "digest"])
  broadcast_type?: "scheduled" | "recurring" | "event_triggered" | "digest";

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BroadcastAudienceDto)
  audience?: BroadcastAudienceDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BroadcastContentDto)
  content?: BroadcastContentDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BroadcastScheduleDto)
  schedule?: BroadcastScheduleDto;

  @IsOptional()
  @IsIn(["as_user", "as_group", "as_role_profile"])
  sender_mode?: "as_user" | "as_group" | "as_role_profile";

  @IsOptional()
  @IsString()
  identity_id?: string;

  @IsOptional()
  @IsBoolean()
  requires_approval?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  rate_limit_per_minute?: number;
}

export class ScheduleBroadcastDto {
  @IsOptional()
  @IsString()
  at?: string;

  @IsOptional()
  @IsString()
  cron?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotency_key?: string;
}

export class PublishNowDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotency_key?: string;
}
