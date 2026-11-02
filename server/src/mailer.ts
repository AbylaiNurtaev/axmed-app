import nodemailer from "nodemailer";
import { config } from "./config.js";

const smtpConfigured = Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD);
const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
    })
  : null;

export function recoveryEmailConfigured() { return transporter !== null; }

export async function sendVerificationCode(email: string, code: string) {
  if (!transporter) {
    if (config.AUTH_EXPOSE_DEV_CODE && config.NODE_ENV !== "production") return { delivered: false };
    throw new Error("SMTP is not configured");
  }

  await transporter.sendMail({
    from: config.SMTP_FROM,
    to: email,
    subject: "Код подтверждения AxMed",
    text: `Ваш код подтверждения AxMed: ${code}. Он действует ${config.VERIFICATION_CODE_TTL_MINUTES} минут.`,
    html: `<p>Ваш код подтверждения AxMed:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Код действует ${config.VERIFICATION_CODE_TTL_MINUTES} минут.</p>`
  });

  return { delivered: true };
}

export async function sendPasswordResetCode(email: string, code: string) {
  if (!transporter) throw new Error("SMTP is not configured for password recovery");
  await transporter.sendMail({ from: config.SMTP_FROM, to: email,
    subject: "Восстановление пароля AxMed",
    text: `Код для восстановления пароля AxMed: ${code}. Он действует 10 минут. Если вы не запрашивали восстановление, проигнорируйте это письмо.`,
    html: `<p>Код для восстановления пароля AxMed:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Код действует 10 минут. Если вы не запрашивали восстановление, проигнорируйте это письмо.</p>` });
}

export async function sendPasswordChangedNotice(email: string) {
  if (!transporter) throw new Error("SMTP is not configured for password recovery");
  await transporter.sendMail({ from: config.SMTP_FROM, to: email, subject: "Пароль AxMed изменён",
    text: "Пароль вашего аккаунта AxMed изменён. Все прежние сессии завершены. Если это были не вы, восстановите пароль через приложение." });
}
