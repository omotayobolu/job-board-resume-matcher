import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 1 << 15;
const r = 8;
const p = 3;
const keyLength = 64;
const maxmem = 64 * 1024 * 1024;
const dummySalt = Buffer.alloc(16);

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { N, r, p, maxmem }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string | null | undefined): Promise<boolean> {
  const parts = typeof storedHash === "string" ? storedHash.split("$") : [];
  const valid =
    parts.length === 6 &&
    parts[0] === "scrypt" &&
    Number(parts[1]) === N &&
    Number(parts[2]) === r &&
    Number(parts[3]) === p &&
    /^[a-f0-9]{32}$/i.test(parts[4] ?? "") &&
    /^[a-f0-9]{128}$/i.test(parts[5] ?? "");

  const salt = valid ? Buffer.from(parts[4]!, "hex") : dummySalt;
  const derived = await derive(password, salt);
  return valid && timingSafeEqual(derived, Buffer.from(parts[5]!, "hex"));
}

export { hashPassword,verifyPassword };
