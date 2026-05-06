import { IsString, MaxLength } from "class-validator";

export class UpsertMemberProfileFieldDto {
  @IsString()
  @MaxLength(50)
  key!: string;

  @IsString()
  @MaxLength(500)
  value!: string;
}
