import { appConfig } from "@/lib/config";
import type { ChatMessage } from "@/lib/types";

export type EncryptedMessagePayloadInput = {
  version: string;
  algorithm: string;
  ciphertext: string;
  nonce: string;
  aad?: string;
  key_id?: string;
  recipient_key_ids?: string[];
};

const ENCRYPTED_PAYLOAD_VERSION = "web-aes-v1";
const ENCRYPTED_PAYLOAD_ALGORITHM = "aes-256-gcm";
const ENCRYPTED_PAYLOAD_KEY_ID = "web-shared-v1";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function encryptMessageText(chatId: string, text: string): Promise<EncryptedMessagePayloadInput> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(JSON.stringify({ chatId, version: ENCRYPTED_PAYLOAD_VERSION }));
  const key = await resolveEncryptionKey(chatId);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aad)
    },
    key,
    encoder.encode(text)
  );

  return {
    version: ENCRYPTED_PAYLOAD_VERSION,
    algorithm: ENCRYPTED_PAYLOAD_ALGORITHM,
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    nonce: toBase64(nonce),
    aad: toBase64(aad),
    key_id: ENCRYPTED_PAYLOAD_KEY_ID,
    recipient_key_ids: [ENCRYPTED_PAYLOAD_KEY_ID]
  };
}

export async function decryptMessageText(chatId: string, message: ChatMessage): Promise<string | null> {
  const payload = message.encryptedPayload;
  if (!message.isEncrypted || !payload) {
    return message.text ?? null;
  }
  if (payload.version !== ENCRYPTED_PAYLOAD_VERSION || payload.algorithm.toLowerCase() !== ENCRYPTED_PAYLOAD_ALGORITHM) {
    return null;
  }

  try {
    const key = await resolveEncryptionKey(chatId);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(payload.nonce),
        additionalData: payload.aad ? fromBase64(payload.aad) : undefined
      },
      key,
      fromBase64(payload.ciphertext)
    );
    return decoder.decode(decrypted);
  } catch {
    return null;
  }
}

async function resolveEncryptionKey(chatId: string): Promise<CryptoKey> {
  const configured = appConfig.chatEncryptionKey.trim();
  const passphrase = configured.length > 0 ? configured : `phantom-lab-chat:${chatId}:default-web-encryption-key`;
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(passphrase));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return toArrayBuffer(bytes);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
