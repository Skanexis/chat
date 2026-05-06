import { Module } from "@nestjs/common";

import { ChatAntiAbuseService } from "./chat-anti-abuse.service.js";
import { ChatController } from "./chat.controller.js";
import { ChatService } from "./chat.service.js";
import { ScheduledMessagesService } from "./scheduled-messages.service.js";

@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatAntiAbuseService, ScheduledMessagesService],
  exports: [ChatService]
})
export class ChatModule {}
