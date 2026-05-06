import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller.js";
import { AuthReplayStoreService } from "./auth-replay-store.service.js";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard.js";
import { AuthService } from "./auth.service.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitGuard, AuthReplayStoreService],
  exports: [AuthService]
})
export class AuthModule {}
