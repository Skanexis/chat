import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

import type { ReadReceiptMode } from "../../core/types.js";

export class MarkReadReceiptDto {
  @IsOptional()
  @IsString()
  read_at?: string;
}

export class UpdateReadReceiptPrivacyDto {
  @IsOptional()
  @IsIn(["off", "private", "role_visible", "global"])
  mode?: ReadReceiptMode;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  target_user_id?: string;

  @IsOptional()
  @IsBoolean()
  allow_cross_role_view?: boolean;
}
