import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateTempRoomDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  starts_at?: string;

  @IsOptional()
  @IsString()
  ends_at?: string;

  @IsOptional()
  @IsBoolean()
  inherit_permissions?: boolean;

  @IsOptional()
  @IsObject()
  permission_overrides?: Record<string, unknown>;
}

export class ArchiveTempRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class RestoreTempRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
