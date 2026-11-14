import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.platform !== "darwin") {
  console.log("Skipping LEFU Swift parser test outside macOS");
  process.exit(0);
}

const output = join(mkdtempSync(join(tmpdir(), "axmed-lefu-test-")), "parser-test");
const result = spawnSync("xcrun", [
  "swiftc",
  "modules/axmed-lefu-scale/ios/LefuScalePacket.swift",
  "tests/lefu-scale-parser/main.swift",
  "-o", output
], { encoding: "utf8" });
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}
const run = spawnSync(output, [], { encoding: "utf8" });
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
process.exit(run.status ?? 1);
