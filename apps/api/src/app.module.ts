import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { resolveJwtClaimOptions, resolveJwtSignAlgorithm } from "./core/jwt-config.js";
import { CoreModule } from "./core/core.module.js";
import { HealthController } from "./health.controller.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { AlertsModule } from "./modules/alerts/alerts.module.js";
import { BookmarksModule } from "./modules/bookmarks/bookmarks.module.js";
import { BroadcastsModule } from "./modules/broadcasts/broadcasts.module.js";
import { ChatModule } from "./modules/chat/chat.module.js";
import { E2EModule } from "./modules/e2e/e2e.module.js";
import { ExportsModule } from "./modules/exports/exports.module.js";
import { IncidentModeModule } from "./modules/incident-mode/incident-mode.module.js";
import { InvitesModule } from "./modules/invites/invites.module.js";
import { IntegrationsModule } from "./modules/integrations/integrations.module.js";
import { KnowledgeModule } from "./modules/knowledge/knowledge.module.js";
import { LimitsModule } from "./modules/limits/limits.module.js";
import { MemberTagsModule } from "./modules/member-tags/member-tags.module.js";
import { MemberProfileFieldsModule } from "./modules/member-profile-fields/member-profile-fields.module.js";
import { NotificationsModule } from "./modules/notifications/notifications.module.js";
import { AutomationModule } from "./modules/automation/automation.module.js";
import { PollsModule } from "./modules/polls/polls.module.js";
import { ReadReceiptsModule } from "./modules/read-receipts/read-receipts.module.js";
import { ReputationModule } from "./modules/reputation/reputation.module.js";
import { RemindersModule } from "./modules/reminders/reminders.module.js";
import { RolesModule } from "./modules/roles/roles.module.js";
import { TempRoomsModule } from "./modules/temp-rooms/temp-rooms.module.js";
import { TicketsModule } from "./modules/tickets/tickets.module.js";
import { ThreadSubscriptionsModule } from "./modules/thread-subscriptions/thread-subscriptions.module.js";
import { UnreadSummaryModule } from "./modules/unread-summary/unread-summary.module.js";
import { TranslationsModule } from "./modules/translations/translations.module.js";
import { WsModule } from "./modules/ws/ws.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/api/.env", ".env"]
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: (() => {
          const secret = configService.get<string>("JWT_SECRET", "dev-secret") ?? "dev-secret";
          const env = (configService.get<string>("NODE_ENV", "development") ?? "development").toLowerCase();
          if ((env === "production" || env === "staging") && secret.length < 32) {
            throw new Error("JWT_SECRET must be at least 32 characters in production/staging.");
          }
          return secret;
        })(),
        signOptions: {
          expiresIn: "15m",
          algorithm: resolveJwtSignAlgorithm(configService),
          ...resolveJwtClaimOptions(configService)
        }
      })
    }),
    CoreModule,
    AuthModule,
    AlertsModule,
    AutomationModule,
    BookmarksModule,
    BroadcastsModule,
    ChatModule,
    E2EModule,
    ExportsModule,
    IncidentModeModule,
    InvitesModule,
    IntegrationsModule,
    KnowledgeModule,
    LimitsModule,
    MemberProfileFieldsModule,
    MemberTagsModule,
    NotificationsModule,
    PollsModule,
    ReadReceiptsModule,
    ReputationModule,
    RemindersModule,
    RolesModule,
    TempRoomsModule,
    TicketsModule,
    TranslationsModule,
    ThreadSubscriptionsModule,
    UnreadSummaryModule,
    WsModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
