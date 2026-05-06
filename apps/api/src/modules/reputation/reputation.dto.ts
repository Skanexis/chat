import { IsInt, IsOptional, IsString, MaxLength, NotEquals } from "class-validator";

export class AdjustReputationDto {
  @IsString()
  @MaxLength(64)
  user_id!: string;

  @IsInt()
  @NotEquals(0)
  delta!: number;

  @IsString()
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  source_id?: string;
}
