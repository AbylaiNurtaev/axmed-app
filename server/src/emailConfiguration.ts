import { config } from "./config.js";
import { readServiceCredential } from "./serviceCredentialStore.js";
import { emailApiCredentialSchema, type EmailApiCredential } from "./transactionalEmail.js";
import { ApiError } from "./errors.js";

export async function emailApiCredential(): Promise<EmailApiCredential | undefined> {
  const from = config.EMAIL_FROM || config.SMTP_FROM;
  if (config.RESEND_API_KEY) return { provider: "resend", apiKey: config.RESEND_API_KEY, from };
  if (config.BREVO_API_KEY) return { provider: "brevo", apiKey: config.BREVO_API_KEY, from };
  try {
    const stored = await readServiceCredential("transactional-email");
    return stored === undefined ? undefined : emailApiCredentialSchema.parse(stored);
  } catch {
    console.error("Transactional email configuration is unavailable");
    throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Отправка писем временно недоступна.");
  }
}
