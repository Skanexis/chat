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

type SendChannelMessageOptions = {
  chatId?: string;
};

@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendChannelMessage(text: string, options: SendChannelMessageOptions = {}): Promise<TelegramSendResult> {
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
    const miniAppUrl = this.resolveMiniAppUrl(options.chatId);
    const payload: Record<string, unknown> = {
      chat_id: channelId,
      text,
      disable_web_page_preview: true
    };
    if (miniAppUrl) {
      payload.reply_markup = {
        inline_keyboard: [[{ text: "Open Mini App Chat", url: miniAppUrl }]]
      };
    }

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      const response = await this.postWithTimeout(apiUrl, timeoutMs, payload);

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

  private resolveMiniAppUrl(chatId: string | undefined): string | null {
    const explicitUrl = this.configService.get<string>("TELEGRAM_MINI_APP_URL")?.trim();
    if (explicitUrl) {
      return explicitUrl;
    }

    const botUsername = this.configService.get<string>("TELEGRAM_BOT_USERNAME")?.trim().replace(/^@/, "");
    if (!botUsername) {
      return null;
    }

    const startAppRaw = this.configService.get<string>("TELEGRAM_MINI_APP_STARTAPP")?.trim();
    const startApp = startAppRaw && startAppRaw.length > 0 ? startAppRaw : (chatId?.trim() || "main");
    return `https://t.me/${botUsername}?startapp=${encodeURIComponent(startApp)}`;
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}
