import { Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";

export class CreateTicketDto {
  @IsString()
  @MaxLength(64)
  source_message_id!: string;

  @IsOptional()
  @IsIn(["low", "normal", "high", "urgent"])
  priority?: "low" | "normal" | "high" | "urgent";

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignee_id?: string;

  @IsOptional()
  @IsString()
  sla_due_at?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  labels?: string[];
}

export class UpdateTicketDto {
  @IsOptional()
  @IsIn(["open", "in_progress", "waiting", "resolved", "closed"])
  status?: "open" | "in_progress" | "waiting" | "resolved" | "closed";

  @IsOptional()
  @IsIn(["low", "normal", "high", "urgent"])
  priority?: "low" | "normal" | "high" | "urgent";

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(64)
  assignee_id?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  sla_due_at?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  labels?: string[];
}

export class GetTicketSlaStatsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7 * 24 * 60)
  due_soon_minutes?: number;
}
