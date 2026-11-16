import nodemailer from "nodemailer";
import { config } from "./config.js";
import { ApiError } from "./errors.js";

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

export function recoveryEmailConfigured() { return Boolean(config.RESEND_API_KEY || transporter); }

async function deliverMail(message: { to: string; subject: string; text: string; html?: string }) {
  if (config.RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.EMAIL_FROM || config.SMTP_FROM, ...message }),
        signal: AbortSignal.timeout(15_000)
      });
      if (response.ok) return;
      // Provider responses may contain recipients. Keep codes and personal data out of logs.
      console.error(`Email provider rejected delivery (HTTP ${response.status})`);
    } catch {
      console.error("Email provider request failed");
    }
    throw new ApiError(503, "EMAIL_DELIVERY_FAILED", "Не удалось отправить письмо. Попробуйте позже.");
  }
  if (!transporter) throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Отправка писем пока недоступна.");
  await transporter.sendMail({ from: config.SMTP_FROM, ...message });
}

export async function sendVerificationCode(email: string, code: string) {
  if (!recoveryEmailConfigured()) {
    if (config.AUTH_EXPOSE_DEV_CODE && config.NODE_ENV !== "production") return { delivered: false };
    throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Отправка писем пока недоступна.");
  }

  await deliverMail({
    to: email,
    subject: "Код подтверждения AxMed",
    text: `Ваш код подтверждения AxMed: ${code}. Он действует ${config.VERIFICATION_CODE_TTL_MINUTES} минут.`,
    html: `<p>Ваш код подтверждения AxMed:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Код действует ${config.VERIFICATION_CODE_TTL_MINUTES} минут.</p>`
  });

  return { delivered: true };
}

export async function sendPasswordResetCode(email: string, code: string) {
  await deliverMail({ to: email,
    subject: "Восстановление пароля AxMed",
    text: `Код для восстановления пароля AxMed: ${code}. Он действует 10 минут. Если вы не запрашивали восстановление, проигнорируйте это письмо.`,
    html: `<p>Код для восстановления пароля AxMed:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Код действует 10 минут. Если вы не запрашивали восстановление, проигнорируйте это письмо.</p>` });
}

export async function sendPasswordChangedNotice(email: string) {
  await deliverMail({ to: email, subject: "Пароль AxMed изменён",
    text: "Пароль вашего аккаунта AxMed изменён. Все прежние сессии завершены. Если это были не вы, восстановите пароль через приложение." });
}
