import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return {
      ok: true,
      service: "phantom-lab-api",
      sourceCommit: process.env.SOURCE_COMMIT ?? "unknown",
      timestamp: new Date().toISOString()
    };
  }
}
