import { app } from "./app.js";
import { config } from "./config.js";
import { migrateDatabase, pool } from "./database.js";

await migrateDatabase();

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`AxMed API listening on http://${config.HOST}:${config.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
