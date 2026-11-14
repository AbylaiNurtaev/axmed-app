import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../server/package.json", import.meta.url));
require("dotenv").config({ path: fileURLToPath(new URL("../server/.env", import.meta.url)), quiet: true });
const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Recovery tests require a local PostgreSQL server");
const name = `axmed_auth_test_${randomUUID().replaceAll("-", "")}`;
const admin = new (require("pg").Pool)({ connectionString: url.toString() });
let created = false;
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  url.pathname = `/${name}`;
  const child = spawn(process.execPath, ["--import", "tsx", "--test", "tests/passwordRecovery.integration.ts"], {
    cwd: fileURLToPath(new URL("../server/", import.meta.url)), stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test", AUTH_TEST_DATABASE_URL: url.toString() }
  });
  process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
} finally {
  // Only the exact database created above; never the configured application database.
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
