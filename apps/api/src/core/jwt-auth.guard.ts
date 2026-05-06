import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { resolveJwtTokenMaxChars, resolveJwtVerifyOptions } from "./jwt-config.js";
import type { RequestUser } from "./types.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly verifyOptions: ReturnType<typeof resolveJwtVerifyOptions>;
  private readonly maxTokenChars: number;

  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService
  ) {
    this.verifyOptions = resolveJwtVerifyOptions(this.configService);
    this.maxTokenChars = resolveJwtTokenMaxChars(this.configService);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: RequestUser }>();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    const token = authHeader.slice("Bearer ".length);
    if (token.length === 0 || token.length > this.maxTokenChars) {
      throw new UnauthorizedException("Bearer token length is invalid.");
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; telegramId: number; type?: string }>(token, this.verifyOptions);
      if (payload.type !== "access") {
        throw new UnauthorizedException("Bearer token type is invalid.");
      }
      if (!payload.sub || !Number.isFinite(payload.telegramId)) {
        throw new UnauthorizedException("Token payload is invalid.");
      }
      req.user = {
        userId: payload.sub,
        telegramId: payload.telegramId
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid token.");
    }
  }
}
