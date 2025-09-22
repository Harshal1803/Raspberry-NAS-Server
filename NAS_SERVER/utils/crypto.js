import dotenv from "dotenv";
dotenv.config();
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const KEY = crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY).digest();

export function encryptText(text) {
  if (!text) {
    throw new Error("Text is required");
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    iv.toString("base64") +
    ":" +
    tag.toString("base64") +
    ":" +
    encrypted.toString("base64")
  );
}

export function decryptText(payload) {
  const [ivB64, tagB64, encB64] = payload.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const enc = Buffer.from(encB64, "base64");

  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);

  const out = Buffer.concat([decipher.update(enc), decipher.final()]);
  return out.toString("utf8");
}
