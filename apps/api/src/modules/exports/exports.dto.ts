import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ExportHistoryQueryDto {
  @IsOptional()
  @IsIn(["jsonl", "csv"])
  format?: "jsonl" | "csv";

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  author_id?: string;

  @IsOptional()
  @IsIn(["any", "text", "media"])
  content_type?: "any" | "text" | "media";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  limit?: number;
}
