import { z } from "zod";

const emailPattern = /^(?=.{3,254}$)(?=.{1,64}@)[a-z0-9]+(?:[._%+-][a-z0-9]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(emailPattern, "Введите корректный email.");

export const passwordSchema = z
  .string()
  .min(8, "Пароль должен содержать минимум 8 символов.")
  .max(128, "Пароль не должен быть длиннее 128 символов.")
  .regex(/\p{L}/u, "Добавьте в пароль хотя бы одну букву.")
  .regex(/\p{N}/u, "Добавьте в пароль хотя бы одну цифру.");

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema
}).strict();

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, "Код должен состоять из шести цифр.")
}).strict();

export const emailOnlySchema = z.object({ email: emailSchema }).strict();

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(512)
}).strict();

export const socialAuthSchema = z.object({
  provider: z.enum(["google", "apple"]),
  mode: z.enum(["signUp", "signIn"]),
  idToken: z.string().min(20).max(20_000),
  authorizationCode: z.string().max(4_000).nullable().optional(),
  profile: z.object({
    name: z.string().trim().min(1).max(120).nullable().optional(),
    givenName: z.string().trim().min(1).max(60).nullable().optional(),
    familyName: z.string().trim().min(1).max(60).nullable().optional()
  }).strict().optional()
}).strict();

const profileText = (max: number) => z.string().trim().max(max).nullable();

export const profileUpdateSchema = z.object({
  fullName: profileText(120).optional(),
  phone: profileText(40).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  medicalProfile: z.object({
    goal: profileText(160).optional(),
    conditions: profileText(500).optional(),
    medications: profileText(500).optional(),
    allergies: profileText(500).optional(),
    lastCheckup: profileText(80).optional(),
    bodyMeasurements: z.object({
      height: profileText(10).optional(),
      weight: profileText(10).optional(),
      waist: profileText(10).optional(),
      hips: profileText(10).optional(),
      chest: profileText(10).optional(),
      arm: profileText(10).optional(),
      calf: profileText(10).optional()
    }).strict().optional()
  }).strict().optional(),
  appPreferences: z.object({
    language: z.enum(["ru", "kk", "en"]).optional(),
    units: z.enum(["metric", "imperial"]).optional(),
    region: profileText(80).optional(),
    syncEnabled: z.boolean().optional(),
    dailyReminders: z.boolean().optional(),
    waterReminders: z.boolean().optional(),
    measurementReminders: z.boolean().optional(),
    recommendations: z.boolean().optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    textSize: z.enum(["small", "standard", "large"]).optional(),
    accentColor: z.enum(["green", "blue", "rose"]).optional(),
    animations: z.boolean().optional()
  }).strict().optional()
}).strict();

export const avatarUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(160),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataBase64: z.string().min(32).max(7_000_000)
}).strict();

const goalNumber = z.coerce.number().finite().min(0).max(1_000_000);

export const goalCreateSchema = z.object({
  templateKey: z.string().trim().max(80).nullable().optional(),
  title: z.string().trim().min(1).max(140),
  category: z.string().trim().min(1).max(80).optional(),
  icon: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().min(1).max(24).optional(),
  currentValue: goalNumber.optional(),
  targetValue: goalNumber.optional(),
  unit: z.string().trim().max(24).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  status: z.enum(["active", "paused", "completed"]).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
}).strict();

export const goalUpdateSchema = goalCreateSchema.partial().extend({
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional()
}).strict();
