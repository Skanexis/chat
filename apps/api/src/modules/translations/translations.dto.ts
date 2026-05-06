import { Type } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class TranslateMessageDto {
  @IsString()
  @MaxLength(16)
  target_language!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  source_language?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  force_refresh?: boolean;
}
