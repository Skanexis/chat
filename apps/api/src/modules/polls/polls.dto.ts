import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";

export class CreatePollDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  question!: string;

  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  options!: string[];

  @IsOptional()
  @IsBoolean()
  allow_multiple?: boolean;

  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean;

  @IsOptional()
  @IsBoolean()
  is_quiz?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  correct_option_indexes?: number[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  allowed_role_ids?: string[];

  @IsOptional()
  @IsString()
  closes_at?: string;
}

export class VotePollDto {
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(100, { each: true })
  option_indexes!: number[];
}

export class ClosePollDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  reason?: string | null;
}
