import { z } from "zod";
import { ApiError } from "./errors.js";

export const emailApiCredentialSchema = z.object({
  provider: z.enum(["resend", "brevo"]),
  apiKey: z.string().min(12).max(2048),
  from: z.string().min(3).max(320)
}).strict();
export type EmailApiCredential = z.infer<typeof emailApiCredentialSchema>;
export type EmailMessage = { to: string; subject: string; text: string; html?: string };

export function senderAddress(from: string) {
  const match = /^(?:([^<>]*)<([^<>]+)>|([^<>]+))$/.exec(from.trim());
  const email = z.email().parse((match?.[2] ?? match?.[3] ?? "").trim());
  const name = match?.[1]?.trim().replace(/^"|"$/g, "") || "AxMed";
  return { email, name };
}

export async function sendWithEmailApi(credential: EmailApiCredential, message: EmailMessage, request: typeof fetch = fetch) {
  const brevo = credential.provider === "brevo";
  try {
    const response = await request(brevo ? "https://api.brevo.com/v3/smtp/email" : "https://api.resend.com/emails", {
      method: "POST",
      headers: brevo
        ? { "api-key": credential.apiKey, "Content-Type": "application/json", Accept: "application/json" }
        : { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(brevo
        ? { sender: senderAddress(credential.from), to: [{ email: message.to }], subject: message.subject,
            textContent: message.text, ...(message.html ? { htmlContent: message.html } : {}) }
        : { from: credential.from, ...message }),
      signal: AbortSignal.timeout(15_000)
    });
    if (response.ok) return;
    // Provider bodies can contain addresses and message data. Never log them.
    console.error(JSON.stringify({ event: "email_delivery_failed", transport: credential.provider, status: response.status }));
  } catch {
    console.error(JSON.stringify({ event: "email_delivery_failed", transport: credential.provider, code: "REQUEST_FAILED" }));
  }
  throw new ApiError(503, "EMAIL_DELIVERY_FAILED", "Не удалось отправить письмо с кодом. Попробуйте позже.");
}
