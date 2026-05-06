import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { ArchiveTempRoomDto, CreateTempRoomDto, RestoreTempRoomDto } from "./temp-rooms.dto.js";
import { TempRoomsService } from "./temp-rooms.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/temp-rooms")
export class TempRoomsController {
  constructor(private readonly tempRoomsService: TempRoomsService) {}

  @Post()
  async createTempRoom(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateTempRoomDto) {
    return this.tempRoomsService.createTempRoom(chatId, user, dto);
  }

  @Post(":tempRoomId/archive")
  async archiveTempRoom(
    @Param("chatId") chatId: string,
    @Param("tempRoomId") tempRoomId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ArchiveTempRoomDto = {}
  ) {
    return this.tempRoomsService.archiveTempRoom(chatId, tempRoomId, user, dto);
  }

  @Post(":tempRoomId/restore")
  async restoreTempRoom(
    @Param("chatId") chatId: string,
    @Param("tempRoomId") tempRoomId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RestoreTempRoomDto = {}
  ) {
    return this.tempRoomsService.restoreTempRoom(chatId, tempRoomId, user, dto);
  }
}
