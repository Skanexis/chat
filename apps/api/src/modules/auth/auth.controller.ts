import { Body, Controller, Post, UseGuards } from "@nestjs/common";

import type { Chat, User } from "../../core/types.js";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard.js";
import { RefreshSessionDto, TelegramAuthDto } from "./auth.dto.js";
import { AuthService } from "./auth.service.js";

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
  memberships: Chat[];
};

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthRateLimitGuard)
  @Post("telegram")
  async authWithTelegram(@Body() dto: TelegramAuthDto): Promise<AuthResponse> {
    return this.authService.authWithTelegram(dto);
  }

  @UseGuards(AuthRateLimitGuard)
  @Post("refresh")
  async refreshSession(@Body() dto: RefreshSessionDto): Promise<AuthResponse> {
    return this.authService.refreshSession(dto);
  }
}
