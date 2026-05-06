import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateKeywordAlertDto {
  @IsString()
  @MaxLength(120)
  keyword!: string;

  @IsOptional()
  @IsBoolean()
  is_regex?: boolean;

  @IsOptional()
  @IsBoolean()
  case_sensitive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(24 * 60 * 60)
  dedup_window_seconds?: number;
}
