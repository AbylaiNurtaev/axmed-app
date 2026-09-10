import nodemailer from "nodemailer";
import { config } from "./config.js";

const smtpConfigured = Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD);
const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
    })
  : null;

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
