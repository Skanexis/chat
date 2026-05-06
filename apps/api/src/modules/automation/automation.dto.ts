import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateAutomationRuleDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsIn(["message.created", "member.joined", "ticket.overdue", "limit.hit"])
  trigger!: "message.created" | "member.joined" | "ticket.overdue" | "limit.hit";

  @IsArray()
  conditions!: unknown[];

  @IsArray()
  actions!: unknown[];

  @IsBoolean()
  is_enabled!: boolean;
}

export class UpdateAutomationRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(["message.created", "member.joined", "ticket.overdue", "limit.hit"])
  trigger?: "message.created" | "member.joined" | "ticket.overdue" | "limit.hit";

  @IsOptional()
  @IsArray()
  conditions?: unknown[];

  @IsOptional()
  @IsArray()
  actions?: unknown[];

  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}

export class ExecuteAutomationRuleDto {
  @IsOptional()
  @IsIn(["message.created", "member.joined", "ticket.overdue", "limit.hit"])
  trigger?: "message.created" | "member.joined" | "ticket.overdue" | "limit.hit";

  @IsOptional()
  @IsObject()
  input_payload?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;
}

export class ListAutomationExecutionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
