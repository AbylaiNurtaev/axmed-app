import "dotenv/config";
import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default("axmed-api"),
  JWT_AUDIENCE: z.string().min(1).default("axmed-mobile"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  VERIFICATION_CODE_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  AUTH_EXPOSE_DEV_CODE: booleanFromString,
  CORS_ORIGIN: z.string().default("*"),
  GOOGLE_CLIENT_IDS: z.string().default(""),
  APPLE_CLIENT_ID: z.string().min(1).default("com.anonymous.pochka2new"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: booleanFromString,
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM: z.string().default("AxMed <no-reply@example.com>")
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid server environment", z.treeifyError(parsed.error));
  process.exit(1);
}

const env = parsed.data;

export const config = {
  ...env,
  googleClientIds: env.GOOGLE_CLIENT_IDS.split(",").map((value) => value.trim()).filter(Boolean),
  corsOrigins: env.CORS_ORIGIN === "*"
    ? "*" as const
    : env.CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean)
};
