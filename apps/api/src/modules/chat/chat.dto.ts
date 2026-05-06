import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

class MediaDto {
  @IsIn(["image", "video", "audio", "file"])
  type!: "image" | "video" | "audio" | "file";

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  url!: string;
}

class EncryptedPayloadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  version!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  algorithm!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32768)
  ciphertext!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  nonce!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  aad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  key_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  recipient_key_ids?: string[];
}

export class CreateMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MediaDto)
  media?: MediaDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EncryptedPayloadDto)
  encrypted_payload?: EncryptedPayloadDto;

  @IsIn(["as_user", "as_group", "as_role_profile"])
  sender_mode!: "as_user" | "as_group" | "as_role_profile";

  @IsOptional()
  @IsString()
  identity_id?: string;

  @IsOptional()
  @IsIn(["system", "hidden", "custom"])
  signature_mode?: "system" | "hidden" | "custom";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  custom_signature?: string;

  @IsOptional()
  @IsString()
  reply_to_id?: string;
}

export class UpdateMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  custom_signature?: string;
}

export class CreateIdentityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsIn(["group", "role_profile"])
  type!: "group" | "role_profile";
}

export class UpdateIdentityDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListMessagesQueryDto {
  @IsOptional()
  @IsDateString()
  before?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class SearchMessagesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  author_id?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsIn(["any", "text", "media"])
  content_type?: "any" | "text" | "media";

  @IsOptional()
  @IsIn(["image", "video", "audio", "file"])
  media_type?: "image" | "video" | "audio" | "file";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export class ChatBootstrapQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  messages_limit?: number;
}

export class CreateSavedMessageViewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}

export class SetMessageReactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  reaction!: string;
}

export class ScheduleMessageDto {
  @IsString()
  @IsNotEmpty()
  at!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => CreateMessageDto)
  payload!: CreateMessageDto;
}
