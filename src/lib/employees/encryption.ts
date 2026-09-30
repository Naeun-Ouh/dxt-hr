// Pure crypto primitives. Key configuration is loaded only by the server-only wrapper.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export interface Keyring { activeId: string; keys: Record<string, Buffer> }
export function parseKeyring(raw: string | undefined, activeId: string | undefined): Keyring {
  if (!raw || !activeId || !/^[A-Za-z0-9_-]{1,40}$/.test(activeId)) throw new Error("HR encryption configuration unavailable");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid HR keyring");
  const keys: Record<string, Buffer> = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("Invalid HR keyring");
    const key = Buffer.from(value, "base64");
    if (key.length !== 32) throw new Error("Invalid HR key length");
    keys[id] = key;
  }
  if (!Object.hasOwn(keys, activeId)) throw new Error("Missing active HR key");
  return { activeId, keys };
}
export function encryptValue(value: string, context: string, ring: Keyring): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ring.keys[ring.activeId], iv);
  cipher.setAAD(Buffer.from(`dxt-hr:v1:${ring.activeId}:${context}`));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", ring.activeId, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptValue(envelope: string, context: string, ring: Keyring): string {
  if (!/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/.test(envelope)) throw new Error("Invalid encrypted HR value");
  const [, keyId, iv, tag, data] = envelope.split(".");
  if (!Object.hasOwn(ring.keys, keyId)) throw new Error("HR decryption key unavailable");
  const decipher = createDecipheriv("aes-256-gcm", ring.keys[keyId], Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(`dxt-hr:v1:${keyId}:${context}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
