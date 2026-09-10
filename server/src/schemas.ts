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
