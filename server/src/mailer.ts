import nodemailer from "nodemailer";
import { config } from "./config.js";
import { ApiError } from "./errors.js";
import { emailApiCredential } from "./emailConfiguration.js";
import { sendWithEmailApi } from "./transactionalEmail.js";

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

export async function recoveryEmailConfigured() { return Boolean(await emailApiCredential() || transporter); }

async function deliverMail(message: { to: string; subject: string; text: string; html?: string }) {
  const credential = await emailApiCredential();
  if (credential) return sendWithEmailApi(credential, message);
  if (!transporter) throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Отправка писем пока недоступна.");
  try {
    await transporter.sendMail({ from: config.SMTP_FROM, ...message });
  } catch (error) {
    // SMTP errors can include recipients, credentials and message content.
    // Log only recognised operational codes, never the raw provider error.
    const failure = error as { code?: string; responseCode?: number };
    const knownCodes = ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "EDNS", "ETLS", "EAUTH", "ENOAUTH", "EENVELOPE", "EMESSAGE"];
    console.error(JSON.stringify({ event: "email_delivery_failed", transport: "smtp",
      code: failure?.code && knownCodes.includes(failure.code) ? failure.code : "UNKNOWN",
      ...(Number.isInteger(failure?.responseCode) && failure.responseCode! >= 400 && failure.responseCode! <= 599
        ? { responseCode: failure.responseCode } : {}) }));
    throw new ApiError(503, "EMAIL_DELIVERY_FAILED", "Не удалось отправить письмо с кодом. Попробуйте позже.");
  }
}

export async function sendVerificationCode(email: string, code: string) {
  if (!await recoveryEmailConfigured()) {
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
