import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { ApiError } from "./errors.js";
import { config } from "./config.js";
import { query } from "./database.js";
import { queueAccountPhotoCleanupSql } from "./accountDeletionFiles.js";

export type ProfileUpdateInput = {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  gender?: "male" | "female" | null;
  medicalProfile?: Record<string, unknown>;
  appPreferences?: Record<string, unknown>;
};

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  birth_date: string | null;
  gender: "male" | "female" | null;
  avatar_url: string | null;
  email_verified_at: Date | null;
  medical_profile: Record<string, unknown>;
  app_preferences: Record<string, unknown>;
  updated_at: Date;
};

let s3: S3Client | undefined;

export async function loadProfile(userId: string) {
  const result = await query<ProfileRow>(
    `SELECT id, email, display_name, full_name, first_name, last_name, phone, birth_date::text, gender, avatar_url,
            email_verified_at, medical_profile, app_preferences, updated_at
       FROM users WHERE id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "PROFILE_NOT_FOUND", "Профиль не найден.");
  return toProfile(row);
}

export async function updateProfile(userId: string, input: ProfileUpdateInput) {
  const current = await loadProfile(userId);
  const legacyName = input.fullName !== undefined ? splitName(cleanNullable(input.fullName)) : null;
  const firstName = input.firstName !== undefined
    ? cleanNullable(input.firstName)
    : legacyName?.firstName ?? current.firstName;
  const lastName = input.lastName !== undefined
    ? cleanNullable(input.lastName)
    : legacyName?.lastName ?? current.lastName;
  const composedName = [firstName, lastName].filter(Boolean).join(" ") || null;
  const fullName = input.firstName !== undefined || input.lastName !== undefined
    ? composedName
    : input.fullName !== undefined ? cleanNullable(input.fullName) : current.fullName;
  const phone = input.phone !== undefined ? cleanNullable(input.phone) : current.phone;
  const birthDate = input.birthDate !== undefined ? input.birthDate : current.birthDate;
  const gender = input.gender !== undefined ? input.gender : current.gender;
  const medicalProfile = { ...current.medicalProfile, ...(input.medicalProfile ?? {}) };
  const appPreferences = { ...current.appPreferences, ...(input.appPreferences ?? {}) };
  const displayName = fullName || current.displayName;

  const result = await query<ProfileRow>(
    `UPDATE users
        SET full_name = $2, display_name = $3, phone = $4, birth_date = $5, gender = $6,
            medical_profile = $7::jsonb, app_preferences = $8::jsonb,
            first_name = $9, last_name = $10, updated_at = now()
      WHERE id = $1
      RETURNING id, email, display_name, full_name, first_name, last_name, phone, birth_date::text, gender, avatar_url,
                email_verified_at, medical_profile, app_preferences, updated_at`,
    [userId, fullName, displayName, phone, birthDate, gender, JSON.stringify(medicalProfile), JSON.stringify(appPreferences), firstName, lastName]
  );
  return toProfile(result.rows[0]!);
}

export async function uploadAvatar(userId: string, fileName: string, mimeType: string, dataBase64: string) {
  if (!config.AWS_ACCESS_KEY || !config.AWS_SECRET_KEY || !config.AWS_BUCKET_NAME || !config.AWS_S3_REGION) {
    throw new ApiError(503, "S3_NOT_CONFIGURED", "S3-хранилище не настроено.");
  }

  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.byteLength > 5 * 1024 * 1024) {
    throw new ApiError(413, "AVATAR_TOO_LARGE", "Фото должно быть меньше 5 МБ.");
  }

  const current = await loadProfile(userId);
  const extension = extensionFor(mimeType, fileName);
  const key = `users/${userId}/profile/avatar-${Date.now()}-${randomUUID()}${extension}`;
  await getS3().send(new PutObjectCommand({
    Bucket: config.AWS_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    CacheControl: "public, max-age=31536000, immutable"
  }));

  const avatarUrl = `https://${config.AWS_BUCKET_NAME}.s3.${config.AWS_S3_REGION}.amazonaws.com/${encodeURI(key)}`;
  const result = await query<ProfileRow>(
    `UPDATE users SET avatar_url = $2, updated_at = now()
      WHERE id = $1
      RETURNING id, email, display_name, full_name, first_name, last_name, phone, birth_date::text, gender, avatar_url,
                email_verified_at, medical_profile, app_preferences, updated_at`,
    [userId, avatarUrl]
  );

  if (!result.rowCount) {
    // Deletion may have already purged the prefix while PutObject was running.
    // Keep a fresh cleanup job for this late object after the user row is gone.
    await query(queueAccountPhotoCleanupSql, [randomUUID(), `users/${userId}/profile/`]);
    throw new ApiError(401, "UNAUTHORIZED", "Аккаунт уже удалён или сессия истекла.");
  }

  const previousKey = avatarObjectKey(current.avatarUrl, userId);
  if (previousKey) {
    try {
      await getS3().send(new DeleteObjectCommand({ Bucket: config.AWS_BUCKET_NAME, Key: previousKey }));
    } catch {
      // The new avatar is already active; stale object cleanup is best effort.
    }
  }
  return toProfile(result.rows[0]!);
}

export async function removeAvatar(userId: string) {
  const current = await loadProfile(userId);
  const result = await query<ProfileRow>(
    `UPDATE users SET avatar_url = NULL, updated_at = now()
      WHERE id = $1
      RETURNING id, email, display_name, full_name, first_name, last_name, phone, birth_date::text, gender, avatar_url,
                email_verified_at, medical_profile, app_preferences, updated_at`,
    [userId]
  );

  const key = avatarObjectKey(current.avatarUrl, userId);
  if (key && config.AWS_BUCKET_NAME && config.AWS_S3_REGION && config.AWS_ACCESS_KEY && config.AWS_SECRET_KEY) {
    try {
      await getS3().send(new DeleteObjectCommand({ Bucket: config.AWS_BUCKET_NAME, Key: key }));
    } catch {
      // The account no longer references the image. Storage cleanup can be retried separately.
    }
  }
  return toProfile(result.rows[0]!);
}

function getS3() {
  s3 ??= new S3Client({
    region: config.AWS_S3_REGION,
    credentials: { accessKeyId: config.AWS_ACCESS_KEY, secretAccessKey: config.AWS_SECRET_KEY }
  });
  return s3;
}

function extensionFor(mimeType: string, fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return ".jpg";
  if (lower.endsWith(".png")) return ".png";
  if (lower.endsWith(".webp")) return ".webp";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

function avatarObjectKey(value: string | null, userId: string) {
  if (!value || !config.AWS_BUCKET_NAME || !config.AWS_S3_REGION) return null;
  try {
    const url = new URL(value);
    const expectedHost = `${config.AWS_BUCKET_NAME}.s3.${config.AWS_S3_REGION}.amazonaws.com`;
    const key = decodeURIComponent(url.pathname.replace(/^\//, ""));
    return url.hostname === expectedHost && key.startsWith(`users/${userId}/profile/`) ? key : null;
  } catch {
    return null;
  }
}

function cleanNullable(value: string | null) {
  const cleaned = value?.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function toProfile(row: ProfileRow | undefined) {
  if (!row) throw new ApiError(401, "UNAUTHORIZED", "Аккаунт уже удалён или сессия истекла.");
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    fullName: row.full_name,
    firstName: row.first_name ?? splitName(row.full_name).firstName,
    lastName: row.last_name ?? splitName(row.full_name).lastName,
    phone: row.phone,
    birthDate: row.birth_date,
    gender: row.gender,
    avatarUrl: row.avatar_url,
    emailVerified: Boolean(row.email_verified_at),
    medicalProfile: row.medical_profile ?? {},
    appPreferences: row.app_preferences ?? {},
    updatedAt: row.updated_at.toISOString()
  };
}

function splitName(value: string | null) {
  const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") || null };
}
