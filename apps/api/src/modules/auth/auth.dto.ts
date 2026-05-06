import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class TelegramAuthDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(10000)
  initData!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9:_-]+$/)
  chatId?: string;
}

export class RefreshSessionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(20)
  @MaxLength(10000)
  refreshToken!: string;
}
