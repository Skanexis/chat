import { IsString, MaxLength } from "class-validator";

export class AssignMemberTagDto {
  @IsString()
  @MaxLength(40)
  tag!: string;
}
