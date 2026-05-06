import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { DATABASE_SERVICE } from "./database.service.js";
import { EventBusService } from "./event-bus.service.js";
import { InMemoryDatabase } from "./in-memory-database.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { PolicyService } from "./policy.service.js";
import { PrismaDatabaseService } from "./prisma-database.service.js";
import { PrismaService } from "./prisma/prisma.service.js";

@Global()
@Module({
  imports: [JwtModule],
  providers: [
    InMemoryDatabase,
    PrismaService,
    PrismaDatabaseService,
    {
      provide: DATABASE_SERVICE,
      inject: [ConfigService, InMemoryDatabase, PrismaDatabaseService],
      useFactory: (configService: ConfigService, inMemory: InMemoryDatabase, prismaDb: PrismaDatabaseService) => {
        const driver = (configService.get<string>("STORAGE_DRIVER", "inmemory") ?? "inmemory").toLowerCase();
        return driver === "postgres" ? prismaDb : inMemory;
      }
    },
    PolicyService,
    EventBusService,
    JwtAuthGuard
  ],
  exports: [DATABASE_SERVICE, PolicyService, EventBusService, JwtAuthGuard]
})
export class CoreModule {}
