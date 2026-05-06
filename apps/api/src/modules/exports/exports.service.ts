import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { Message, RequestUser } from "../../core/types.js";
import type { ExportHistoryQueryDto } from "./exports.dto.js";

type ExportRow = {
  id: string;
  chat_id: string;
  author_id: string;
  actor_user_id: string;
  display_author_type: string;
  display_author_id: string;
  sender_mode: string;
  text: string;
  media_type: string;
  media_url: string;
  reply_to_id: string;
  created_at: string;
  updated_at: string;
};

type ExportResult = {
  format: "jsonl" | "csv";
  filename: string;
  rows: number;
  content: string;
};

@Injectable()
export class ExportsService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService
  ) {}

  async exportHistory(chatId: string, requestUser: RequestUser, query: ExportHistoryQueryDto): Promise<ExportResult> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "audit.export");

    return this.buildExport(chatId, requestUser.userId, query, {
      action: "history.export",
      targetType: "chat",
      targetId: chatId,
      filenamePrefix: `chat_${chatId}_history`
    });
  }

  async exportTempRoomHistory(
    chatId: string,
    tempRoomId: string,
    requestUser: RequestUser,
    query: ExportHistoryQueryDto
  ): Promise<ExportResult> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "audit.export");

    const room = await this.db.getTempRoom(chatId, tempRoomId);
    if (room.status !== "archived") {
      throw new BadRequestException("Temp room export is allowed only for archived rooms.");
    }

    const roomFromTs = Date.parse(room.startsAt ?? room.createdAt);
    const roomToTs = Date.parse(room.endsAt ?? room.archivedAt ?? room.updatedAt);
    const fromTs = this.maxTs(this.parseIso(query.from, "from"), roomFromTs);
    const toTs = this.minTs(this.parseIso(query.to, "to"), roomToTs);

    return this.buildExport(chatId, requestUser.userId, query, {
      action: "history.export.temp_room",
      targetType: "temp_room",
      targetId: room.id,
      filenamePrefix: `chat_${chatId}_temp_room_${room.id}_history`,
      forceFromTs: fromTs,
      forceToTs: toTs,
      extraAuditPayload: {
        temp_room_id: room.id,
        temp_room_name: room.name,
        temp_room_status: room.status,
        room_from: new Date(roomFromTs).toISOString(),
        room_to: new Date(roomToTs).toISOString()
      }
    });
  }

  private parseIso(value: string | undefined, field: "from" | "to"): number | null {
    if (!value) {
      return null;
    }
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(`Invalid ${field} datetime format.`);
    }
    return parsed;
  }

  private maxTs(value: number | null, floor: number): number {
    if (value === null) {
      return floor;
    }
    return Math.max(value, floor);
  }

  private minTs(value: number | null, ceil: number): number {
    if (value === null) {
      return ceil;
    }
    return Math.min(value, ceil);
  }

  private async buildExport(
    chatId: string,
    actorUserId: string,
    query: ExportHistoryQueryDto,
    options: {
      action: string;
      targetType: string;
      targetId: string;
      filenamePrefix: string;
      forceFromTs?: number;
      forceToTs?: number;
      extraAuditPayload?: Record<string, unknown>;
    }
  ): Promise<ExportResult> {
    const requestedFromTs = this.parseIso(query.from, "from");
    const requestedToTs = this.parseIso(query.to, "to");
    if (requestedFromTs !== null && requestedToTs !== null && requestedFromTs > requestedToTs) {
      throw new BadRequestException("from must be less than or equal to to.");
    }

    const fromTs = options.forceFromTs ?? requestedFromTs;
    const toTs = options.forceToTs ?? requestedToTs;
    if (fromTs !== null && toTs !== null && fromTs > toTs) {
      throw new BadRequestException("No exportable history in requested range for this context.");
    }

    const format = query.format ?? "jsonl";
    const contentType = query.content_type ?? "any";
    const limit = query.limit ?? 5000;

    const messages = await this.db.listMessages(chatId);
    const filtered = messages
      .filter((message) => {
        if (query.author_id && message.authorId !== query.author_id) {
          return false;
        }
        const createdTs = Date.parse(message.createdAt);
        if (fromTs !== null && Number.isFinite(createdTs) && createdTs < fromTs) {
          return false;
        }
        if (toTs !== null && Number.isFinite(createdTs) && createdTs > toTs) {
          return false;
        }
        if (contentType === "text" && !message.text) {
          return false;
        }
        if (contentType === "media" && !message.media) {
          return false;
        }
        return true;
      })
      .slice(0, limit);

    const rows = filtered.map((message) => this.toExportRow(message));
    const content = format === "csv" ? this.toCsv(rows) : this.toJsonl(rows);
    const now = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${options.filenamePrefix}_${now}.${format}`;

    await this.db.addAuditLog({
      chatId,
      actorId: actorUserId,
      action: options.action,
      targetType: options.targetType,
      targetId: options.targetId,
      payload: {
        format,
        rows: rows.length,
        filters: {
          requested_from: query.from ?? null,
          requested_to: query.to ?? null,
          applied_from: fromTs !== null ? new Date(fromTs).toISOString() : null,
          applied_to: toTs !== null ? new Date(toTs).toISOString() : null,
          author_id: query.author_id ?? null,
          content_type: contentType
        },
        ...options.extraAuditPayload
      }
    });

    return {
      format,
      filename,
      rows: rows.length,
      content
    };
  }

  private toExportRow(message: Message): ExportRow {
    return {
      id: message.id,
      chat_id: message.chatId,
      author_id: message.authorId,
      actor_user_id: message.actorUserId,
      display_author_type: message.displayAuthorType,
      display_author_id: message.displayAuthorId,
      sender_mode: message.senderMode,
      text: message.text ?? "",
      media_type: message.media?.type ?? "",
      media_url: message.media?.url ?? "",
      reply_to_id: message.replyToId ?? "",
      created_at: message.createdAt,
      updated_at: message.updatedAt
    };
  }

  private toJsonl(rows: ExportRow[]): string {
    if (rows.length === 0) {
      return "";
    }
    return rows.map((row) => JSON.stringify(row)).join("\n");
  }

  private toCsv(rows: ExportRow[]): string {
    const headers: Array<keyof ExportRow> = [
      "id",
      "chat_id",
      "author_id",
      "actor_user_id",
      "display_author_type",
      "display_author_id",
      "sender_mode",
      "text",
      "media_type",
      "media_url",
      "reply_to_id",
      "created_at",
      "updated_at"
    ];
    const lines = [headers.join(",")];
    for (const row of rows) {
      const line = headers.map((header) => this.escapeCsvCell(row[header])).join(",");
      lines.push(line);
    }
    return lines.join("\n");
  }

  private escapeCsvCell(value: string): string {
    if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
      return `"${value.replaceAll("\"", "\"\"")}"`;
    }
    return value;
  }
}
