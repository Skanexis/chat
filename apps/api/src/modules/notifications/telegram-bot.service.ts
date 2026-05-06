import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type TelegramSendResult = {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  statusCode?: number;
  attempts: number;
  responseBody?: unknown;
};

@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendChannelMessage(text: string): Promise<TelegramSendResult> {
    const botToken = this.configService.get<string>("TELEGRAM_BOT_TOKEN");
    const channelId = this.configService.get<string>("TELEGRAM_NOTIFY_CHANNEL_ID");
    if (!botToken || !channelId) {
      return {
        ok: false,
        skipped: true,
        reason: "TELEGRAM_BOT_TOKEN or TELEGRAM_NOTIFY_CHANNEL_ID is not configured.",
        attempts: 0
      };
    }

    const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const retryAttempts = this.parsePositiveInt(this.configService.get<string>("TELEGRAM_NOTIFY_RETRY_ATTEMPTS"), 3);
    const timeoutMs = this.parsePositiveInt(this.configService.get<string>("TELEGRAM_NOTIFY_TIMEOUT_MS"), 8000);

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      const response = await this.postWithTimeout(apiUrl, timeoutMs, {
        chat_id: channelId,
        text,
        disable_web_page_preview: true
      });

      if (!response) {
        if (attempt === retryAttempts) {
          return {
            ok: false,
            skipped: false,
            reason: "Telegram API request timed out.",
            attempts: attempt
          };
        }
        continue;
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      const isOk = response.ok && this.extractTelegramOk(body);
      if (isOk) {
        return {
          ok: true,
          skipped: false,
          attempts: attempt,
          statusCode: response.status,
          responseBody: body
        };
      }

      if (attempt === retryAttempts) {
        this.logger.warn(`Telegram channel send failed after ${attempt} attempts.`);
        return {
          ok: false,
          skipped: false,
          attempts: attempt,
          statusCode: response.status,
          responseBody: body
        };
      }
    }

    return {
      ok: false,
      skipped: false,
      attempts: retryAttempts
    };
  }

  private async postWithTimeout(url: string, timeoutMs: number, payload: Record<string, unknown>): Promise<Response | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractTelegramOk(body: unknown): boolean {
    if (!body || typeof body !== "object") {
      return false;
    }
    const record = body as Record<string, unknown>;
    return record.ok === true;
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}
