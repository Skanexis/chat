import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateBookmarkDto {
  @IsString()
  @MaxLength(128)
  message_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  collection?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  is_shared?: boolean;
}

