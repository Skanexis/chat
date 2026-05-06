import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

import type { WebhookEvent } from "../../core/types.js";
import { WEBHOOK_SUPPORTED_EVENTS } from "./webhook-events.js";

export class CreateIntegrationWebhookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(2000)
  url!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(WEBHOOK_SUPPORTED_EVENTS, { each: true })
  events!: WebhookEvent[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateIntegrationWebhookDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(WEBHOOK_SUPPORTED_EVENTS, { each: true })
  events?: WebhookEvent[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class RotateIntegrationWebhookSecretDto {
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  secret?: string;
}
