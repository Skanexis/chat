import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class EnableIncidentModeDto {
  @IsString()
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @IsObject()
  policy_snapshot_json?: Record<string, unknown>;
}

export class DisableIncidentModeDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
