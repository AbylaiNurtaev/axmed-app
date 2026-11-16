import { webcrypto } from "crypto";
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

import { app } from "./app.js";
import { config } from "./config.js";
import { migrateDatabase, pool } from "./database.js";
import { processAccountDeletionFiles, purgeExpiredSecurityCounters } from "./accountDeletionFiles.js";
import { ensureServiceCredentialStore } from "./serviceCredentialStore.js";

await migrateDatabase();
await ensureServiceCredentialStore();
const cleanupFiles = () => void Promise.all([processAccountDeletionFiles(), purgeExpiredSecurityCounters()]).catch(() => console.error("Account cleanup will be retried"));
cleanupFiles();
const cleanupTimer = setInterval(cleanupFiles, 10 * 60_000);
cleanupTimer.unref();

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`AxMed API listening on http://${config.HOST}:${config.PORT}`);
});

async function shutdown(signal: string) {
  clearInterval(cleanupTimer);
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
