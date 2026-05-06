import { IsBooleanString, IsOptional, IsString, MaxLength } from "class-validator";

export class GetUnreadSummaryQueryDto {
  @IsOptional()
  @IsBooleanString()
  mentions_only?: string;

  @IsOptional()
  @IsBooleanString()
  moderation_only?: string;

  @IsOptional()
  @IsBooleanString()
  announcements_only?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  since?: string;
}
