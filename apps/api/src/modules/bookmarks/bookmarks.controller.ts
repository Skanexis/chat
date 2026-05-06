import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { CreateBookmarkDto } from "./bookmarks.dto.js";
import { BookmarksService } from "./bookmarks.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/bookmarks")
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Post()
  async createBookmark(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateBookmarkDto) {
    return this.bookmarksService.createBookmark(chatId, user, dto);
  }

  @Get()
  async listBookmarks(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.bookmarksService.listBookmarks(chatId, user);
  }

  @Delete(":bookmarkId")
  async deleteBookmark(@Param("chatId") chatId: string, @Param("bookmarkId") bookmarkId: string, @CurrentUser() user: RequestUser) {
    return this.bookmarksService.deleteBookmark(chatId, bookmarkId, user);
  }
}

