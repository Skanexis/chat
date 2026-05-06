import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";

export class CreateKnowledgeArticleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  category?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(["draft", "review", "published", "archived"])
  status?: "draft" | "review" | "published" | "archived";
}

export class UpdateKnowledgeArticleDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  category?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(["draft", "review", "published", "archived"])
  status?: "draft" | "review" | "published" | "archived";
}
