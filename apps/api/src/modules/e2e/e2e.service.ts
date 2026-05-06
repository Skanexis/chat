import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { ChatMember, E2EDevice, RequestUser } from "../../core/types.js";
import { ListE2EDevicesQueryDto, UpsertE2EDeviceDto } from "./e2e.dto.js";

@Injectable()
export class E2EService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly configService: ConfigService
  ) {}

  async upsertDevice(chatId: string, requestUser: RequestUser, dto: UpsertE2EDeviceDto): Promise<E2EDevice> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.assertCanOrFallback(chatId, member, "e2e.device.register", "message.send.text");
    const payload = this.normalizeAndValidateDevicePayload(dto);

    const saved = await this.db.upsertE2EDevice({
      chatId,
      userId: requestUser.userId,
      deviceId: payload.deviceId,
      algorithm: payload.algorithm,
      identityKey: payload.identityKey,
      signedPreKey: payload.signedPreKey,
      oneTimePreKeys: payload.oneTimePreKeys,
      fallbackKey: payload.fallbackKey,
      lastPreKeyRotationAt: dto.last_pre_key_rotation_at ?? null
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "e2e.device.upsert",
      targetType: "e2e_device",
      targetId: saved.id,
      payload: {
        deviceId: saved.deviceId,
        algorithm: saved.algorithm,
        oneTimePreKeysCount: saved.oneTimePreKeys.length,
        isActive: saved.isActive
      }
    });

    return saved;
  }

  async listOwnDevices(chatId: string, requestUser: RequestUser): Promise<E2EDevice[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.assertCanOrFallback(chatId, member, "e2e.device.view", "chat.view");
    return this.db.listE2EDevicesForUser(chatId, requestUser.userId);
  }

  async listDevices(chatId: string, requestUser: RequestUser, query: ListE2EDevicesQueryDto): Promise<E2EDevice[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.assertCanOrFallback(chatId, member, "e2e.device.view", "chat.view");

    const userIds = this.parseUserIds(query.user_ids);
    const devices = await this.db.listE2EDevices(chatId, userIds);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "e2e.device.list",
      targetType: "chat",
      targetId: chatId,
      payload: {
        userIds: userIds ?? null,
        resultCount: devices.length
      }
    });
    return devices;
  }

  async deactivateDevice(chatId: string, deviceId: string, requestUser: RequestUser): Promise<E2EDevice> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.assertCanOrFallback(chatId, member, "e2e.device.register", "message.send.text");

    const deactivated = await this.db.deactivateE2EDevice(chatId, requestUser.userId, deviceId);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "e2e.device.deactivate",
      targetType: "e2e_device",
      targetId: deactivated.id,
      payload: {
        deviceId: deactivated.deviceId
      }
    });
    return deactivated;
  }

  private parseUserIds(raw?: string): string[] | undefined {
    if (!raw) {
      return undefined;
    }
    const parsed = Array.from(
      new Set(
        raw
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      )
    );
    if (parsed.length === 0) {
      return undefined;
    }
    if (parsed.length > 200) {
      throw new BadRequestException("user_ids filter supports maximum 200 users per request.");
    }
    return parsed;
  }

  private normalizeAndValidateDevicePayload(dto: UpsertE2EDeviceDto): {
    deviceId: string;
    algorithm: string;
    identityKey: string;
    signedPreKey: string;
    oneTimePreKeys: string[];
    fallbackKey: string | null;
  } {
    const deviceId = dto.device_id.trim();
    const algorithm = dto.algorithm.trim().toLowerCase();
    const identityKey = dto.identity_key.trim();
    const signedPreKey = dto.signed_pre_key.trim();
    const fallbackKey = dto.fallback_key?.trim() || null;
    const oneTimePreKeys = Array.from(
      new Set(
        dto.one_time_pre_keys
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      )
    );

    const allowedAlgorithms = this.parseCsvSet(
      this.configService.get<string>("E2E_ALLOWED_DEVICE_ALGORITHMS"),
      ["x25519"]
    );
    if (!allowedAlgorithms.has(algorithm)) {
      throw new BadRequestException(`Unsupported E2E device algorithm: ${dto.algorithm}`);
    }

    this.assertBase64Like(identityKey, "identity_key");
    this.assertBase64Like(signedPreKey, "signed_pre_key");
    for (let index = 0; index < oneTimePreKeys.length; index += 1) {
      this.assertBase64Like(oneTimePreKeys[index]!, `one_time_pre_keys[${index}]`);
    }
    if (fallbackKey) {
      this.assertBase64Like(fallbackKey, "fallback_key");
    }

    const minPreKeys = this.parsePositiveInt(this.configService.get<string>("E2E_MIN_ONE_TIME_PREKEYS"), 10);
    const maxPreKeys = this.parsePositiveInt(this.configService.get<string>("E2E_MAX_ONE_TIME_PREKEYS"), 200);
    if (oneTimePreKeys.length < minPreKeys) {
      throw new BadRequestException(`one_time_pre_keys must contain at least ${minPreKeys} keys.`);
    }
    if (oneTimePreKeys.length > maxPreKeys) {
      throw new BadRequestException(`one_time_pre_keys must contain at most ${maxPreKeys} keys.`);
    }

    return {
      deviceId,
      algorithm,
      identityKey,
      signedPreKey,
      oneTimePreKeys,
      fallbackKey
    };
  }

  private assertBase64Like(value: string, fieldName: string): void {
    if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) {
      throw new BadRequestException(`${fieldName} must be base64/base64url encoded.`);
    }
  }

  private parseCsvSet(raw: string | undefined, fallback: string[]): Set<string> {
    const list = raw
      ? raw
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter((item) => item.length > 0)
      : fallback;
    return new Set(list);
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return Math.floor(value);
  }

  private async assertCanOrFallback(
    chatId: string,
    member: ChatMember,
    permission: string,
    fallbackPermission: string
  ): Promise<void> {
    const allowed = await this.policy.hasPermission(chatId, member, permission);
    if (allowed) {
      return;
    }
    await this.policy.assertCan(chatId, member, fallbackPermission);
  }
}
