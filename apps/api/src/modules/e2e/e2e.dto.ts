import { IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class UpsertE2EDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  device_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  algorithm!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32768)
  identity_key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32768)
  signed_pre_key!: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(32768, { each: true })
  one_time_pre_keys!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(32768)
  fallback_key?: string;

  @IsOptional()
  @IsDateString()
  last_pre_key_rotation_at?: string;
}

export class ListE2EDevicesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  user_ids?: string;
}
