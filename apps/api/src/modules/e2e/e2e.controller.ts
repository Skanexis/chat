import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { E2EService } from "./e2e.service.js";
import { ListE2EDevicesQueryDto, UpsertE2EDeviceDto } from "./e2e.dto.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/e2e/devices")
export class E2EController {
  constructor(private readonly e2eService: E2EService) {}

  @Post()
  async upsertDevice(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: UpsertE2EDeviceDto) {
    return this.e2eService.upsertDevice(chatId, user, dto);
  }

  @Get("me")
  async listOwnDevices(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.e2eService.listOwnDevices(chatId, user);
  }

  @Get()
  async listDevices(
    @Param("chatId") chatId: string,
    @CurrentUser() user: RequestUser,
    @Query() query: ListE2EDevicesQueryDto
  ) {
    return this.e2eService.listDevices(chatId, user, query);
  }

  @Post(":deviceId/deactivate")
  async deactivateDevice(
    @Param("chatId") chatId: string,
    @Param("deviceId") deviceId: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.e2eService.deactivateDevice(chatId, deviceId, user);
  }
}
