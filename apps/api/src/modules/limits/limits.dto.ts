import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UpdateRoleLimitsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  slowmodeSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000000)
  messagesPerDay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000000)
  messagesPerHour?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000000)
  mediaPerDay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000000)
  linksPerDay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000000)
  mentionsPerDay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000000)
  burstCount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  burstWindowSeconds?: number | null;

  @IsOptional()
  @IsIn(["warn", "mute", "reject"])
  exceedAction?: "warn" | "mute" | "reject";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(604800)
  exceedMuteSeconds?: number | null;
}

export class MuteMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UnmuteMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BanMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class KickMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UnbanMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class TimeoutMemberDto {
  @IsInt()
  @Min(1)
  @Max(604800)
  seconds!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ClearTimeoutMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ModerationHistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  target_user_id?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
