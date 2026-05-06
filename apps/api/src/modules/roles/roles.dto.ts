import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsInt()
  @Min(1)
  priority!: number;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class PermissionsPatchDto {
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

export class RoleMemberPatchDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

export class PermissionSimulationDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  actor_user_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  target_user_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  target_role_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  join_target_role_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
