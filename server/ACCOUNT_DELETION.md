# Account deletion operations

An authenticated user starts deletion from **Profile → Security → Delete account**.
The API requires the current password or a verified identity from the linked
provider. Apple-linked accounts must confirm with Apple. Apple authorization is
revoked before the database transaction deletes account-owned records and sessions.
Photo cleanup is queued for retry outside that transaction.

## Apple configuration

Preferred configuration uses `APPLE_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID`, and
`APPLE_SIGN_IN_PRIVATE_KEY` on the API service. `APPLE_CLIENT_ID` must match the
bundle identifier associated with the Sign in with Apple key.

Alternatively, an administrator with database access can provision the key without
reading the server's JWT secret. First deploy this server so startup creates the
`service_credentials` bootstrap. Then supply `DATABASE_URL` through a private
environment and run:

```sh
node dist/configureAppleSignIn.js --key-file /private/AuthKey.p8 --key-id APPLEKEYID --team-id APPLETEAM1
```

The command validates the P-256 private key and stores an authenticated encrypted
envelope. Only the running API can unwrap it using its server secret. These
records have no HTTP administration endpoint. Do not put the key or database URL
in Git, command-line arguments, logs, or build archives.

The encrypted bootstrap is bound to `JWT_SECRET`. Before rotating that secret,
retain the Apple `.p8` key in the administrator's secure storage. After rotation,
recreate only the `bootstrap-v1` record during maintenance, restart the API, and
run the provisioning command again. Deletion via Apple remains unavailable until
the credential has been reprovisioned. Environment-based Apple credentials do not
depend on this bootstrap.

## Checks

```sh
npm test
node --import tsx --test --test-concurrency=1 --test-force-exit tests/accountDeletion.integration.ts
```

The integration suite refuses a non-local database host and creates disposable
fixture accounts. Tests cover confirmation, ownership, provider subject matching,
revocation failure, cascading deletion, and invalidation of old sessions. A real
Apple authorization-code exchange still needs testing with a disposable Apple-linked
account on an iOS device; automated tests simulate provider responses.
