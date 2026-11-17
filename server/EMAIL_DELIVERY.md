# Transactional email

Registration, verification-code resend and password recovery share one delivery
configuration. A successful API response means the provider accepted the message;
it does not guarantee inbox placement.

Railway Free, Trial and Hobby disable outbound SMTP. Use a transactional email
provider over HTTPS on those plans:
https://docs.railway.com/networking/outbound-networking

## Environment configuration

Set one of `RESEND_API_KEY` or `BREVO_API_KEY`, together with `EMAIL_FROM`, e.g.
`AxMed <verified-sender@example.com>`. Server secrets never belong in `EXPO_PUBLIC_*`.

- Resend requires a verified sending domain for arbitrary recipients.
- Brevo requires a verified sender and an activated transactional platform. For
  senders without an authenticated domain, Brevo documents temporary sender-domain
  replacement with `brevosend.com`. Check actual delivery before enabling the flow.
  https://help.brevo.com/hc/en-us/articles/16045394674066-Troubleshooting-Domain-authentication
  https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email

Environment API keys take precedence: Resend, then Brevo. If neither is present,
the server checks its encrypted `transactional-email` credential. SMTP is used only
when no HTTPS provider is configured.

## Configure using an authorised database administrator

When Railway environment access is unavailable, an authorised database
administrator can use the server's existing credential-envelope store. The server
must already have generated its `bootstrap-v1` entry. This command uses only its
public encryption key; it never reads the server's JWT secret.

Save the email API key in a private file outside Git, set the target `DATABASE_URL`
through a private environment, and run from `server`:

```powershell
npx tsx src/configureTransactionalEmail.ts --provider brevo --key-file C:/private/brevo-key.txt --from "AxMed <verified-sender@example.com>"
```

For a compiled deployment, use `node dist/configureTransactionalEmail.js` with
the same arguments. Never put the API key itself in command arguments. Keys are
encrypted with the existing RSA/AES envelope and protected by the server secret.
The next email request reads the updated credential; a restart is unnecessary.
The JWT-rotation considerations in `ACCOUNT_DELETION.md` also apply to this store.

SMTP connection/provider failures return `503 EMAIL_DELIVERY_FAILED`, without
exposing raw errors, recipients, credentials or codes. An unavailable delivery
service never bypasses email verification in production.

## Verification

`tests/registrationDelivery.integration.ts` requires an isolated local database
named `axmed_auth_test_<hex>` in `AUTH_TEST_DATABASE_URL`. It uses a local failing
SMTP socket and a mock HTTPS provider; no real messages are sent. It covers the
HTTP error, encrypted configuration, registration, code confirmation, login,
resend and password recovery. Real provider acceptance and receipt by the owner
must be checked after provisioning the production sender.
