import {
  randomBytes,
  createHash,
  scrypt as nativeScrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(nativeScrypt);
export const token = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function passwordMatches(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}
