import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UpdateChannelNotifyConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(["off", "instant", "digest"])
  mode?: "off" | "instant" | "digest";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  template?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  digestIntervalMinutes?: number;
}

export class TestChannelNotifyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  messagePreview?: string;

  @IsOptional()
  @IsBoolean()
  deliver?: boolean;
}
