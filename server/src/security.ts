import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { SignJWT } from "jose";
import type { PoolClient } from "pg";
import { config } from "./config.js";

const signingKey = new TextEncoder().encode(config.JWT_SECRET);
const scryptOptions = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export type PublicUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
};

export type SessionResponse = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password.normalize("NFKC"), salt, 64, scryptOptions);
  return `scrypt$${scryptOptions.N}$${scryptOptions.r}$${scryptOptions.p}$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] = encoded.split("$");
  if (algorithm !== "scrypt" || !cost || !blockSize || !parallelization || !saltValue || !hashValue) return false;

  const expected = Buffer.from(hashValue, "base64url");
  const actual = await deriveKey(password.normalize("NFKC"), Buffer.from(saltValue, "base64url"), expected.length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
    maxmem: 64 * 1024 * 1024
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createVerificationCode() {
  if (config.AUTH_FIXED_VERIFICATION_CODE && config.NODE_ENV !== "production") {
    return config.AUTH_FIXED_VERIFICATION_CODE;
  }
  return randomInt(100_000, 1_000_000).toString();
}

export function hashVerificationCode(userId: string, code: string) {
  return createHmac("sha256", config.JWT_SECRET).update(`${userId}:${code}`).digest("hex");
}

export function hashesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function deriveKey(
  password: string,
  salt: Buffer,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number }
) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function createSession(
  client: PoolClient,
  user: PublicUser,
  metadata: { userAgent?: string; ip?: string }
): Promise<SessionResponse> {
  const refreshToken = randomBytes(48).toString("base64url");
  const refreshTokenId = randomUUID();
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  await client.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [refreshTokenId, user.id, hashRefreshToken(refreshToken), expiresAt, metadata.userAgent ?? null, metadata.ip ?? null]
  );

  const accessToken = await new SignJWT({ email: user.email, sid: refreshTokenId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(config.JWT_ISSUER)
    .setAudience(config.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(signingKey);

  return { user, accessToken, refreshToken, expiresIn: config.ACCESS_TOKEN_TTL_SECONDS };
}
