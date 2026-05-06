import { Module } from "@nestjs/common";

import { ChannelNotifyPipelineService } from "./channel-notify-pipeline.service.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { TelegramBotService } from "./telegram-bot.service.js";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, TelegramBotService, ChannelNotifyPipelineService]
})
export class NotificationsModule {}
