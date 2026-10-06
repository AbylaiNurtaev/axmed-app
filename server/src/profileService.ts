import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { ApiError } from "./errors.js";
import { config } from "./config.js";
import { query } from "./database.js";

export type ProfileUpdateInput = {
  fullName?: string | null;
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
    `SELECT id, email, display_name, full_name, phone, birth_date::text, gender, avatar_url,
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
  const fullName = input.fullName !== undefined ? cleanNullable(input.fullName) : current.fullName;
  const phone = input.phone !== undefined ? cleanNullable(input.phone) : current.phone;
  const birthDate = input.birthDate !== undefined ? input.birthDate : current.birthDate;
  const gender = input.gender !== undefined ? input.gender : current.gender;
  const medicalProfile = { ...current.medicalProfile, ...(input.medicalProfile ?? {}) };
  const appPreferences = { ...current.appPreferences, ...(input.appPreferences ?? {}) };
  const displayName = fullName || current.displayName;

  const result = await query<ProfileRow>(
    `UPDATE users
        SET full_name = $2, display_name = $3, phone = $4, birth_date = $5, gender = $6,
            medical_profile = $7::jsonb, app_preferences = $8::jsonb, updated_at = now()
      WHERE id = $1
      RETURNING id, email, display_name, full_name, phone, birth_date::text, gender, avatar_url,
                email_verified_at, medical_profile, app_preferences, updated_at`,
    [userId, fullName, displayName, phone, birthDate, gender, JSON.stringify(medicalProfile), JSON.stringify(appPreferences)]
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
      RETURNING id, email, display_name, full_name, phone, birth_date::text, gender, avatar_url,
                email_verified_at, medical_profile, app_preferences, updated_at`,
    [userId, avatarUrl]
  );
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

function cleanNullable(value: string | null) {
  const cleaned = value?.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function toProfile(row: ProfileRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    fullName: row.full_name,
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
