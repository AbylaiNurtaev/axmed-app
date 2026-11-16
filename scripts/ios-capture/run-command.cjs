const { spawnSync } = require("node:child_process");
const seconds = Number(process.argv[2]);
const command = process.argv[3];
if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600 || !command) throw Error("Invalid bounded capture command");
const result = spawnSync(command, process.argv.slice(4), { stdio: "inherit", timeout: seconds * 1000, killSignal: "SIGKILL" });
if (result.error) console.error(result.error.code === "ETIMEDOUT" ? "Capture command exceeded its time limit" : result.error.message);
process.exitCode = result.status ?? 124;
