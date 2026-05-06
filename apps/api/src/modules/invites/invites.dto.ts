import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateIf } from "class-validator";

export class CreateInviteDto {
  @IsOptional()
  @IsIn(["auto", "manual"])
  approval_mode?: "auto" | "manual";

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(64)
  target_role_id?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  max_uses?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  expires_at?: string | null;
}

export class UpdateInviteDto {
  @IsOptional()
  @IsIn(["auto", "manual"])
  approval_mode?: "auto" | "manual";

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(64)
  target_role_id?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  max_uses?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  expires_at?: string | null;
}

export class RotateInviteCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  code?: string;
}

export class UseInviteDto {
  @IsString()
  @MaxLength(128)
  invite_code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateJoinRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  invite_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListJoinRequestsQueryDto {
  @IsOptional()
  @IsIn(["pending", "approved", "rejected"])
  status?: "pending" | "approved" | "rejected";
}

export class RejectJoinRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateJoinPolicyDto {
  @IsOptional()
  @IsIn(["auto", "manual"])
  default_approval_mode?: "auto" | "manual";

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(64)
  default_target_role_id?: string | null;
}
