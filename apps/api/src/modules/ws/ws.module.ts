import { Module } from "@nestjs/common";

import { ChatModule } from "../chat/chat.module.js";
import { ChatGateway } from "./chat.gateway.js";

@Module({
  imports: [ChatModule],
  providers: [ChatGateway]
})
export class WsModule {}
