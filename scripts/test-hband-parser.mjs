import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.platform !== "darwin") {
  console.log("Native parser tests require macOS/Swift; executed on EAS before the iOS build.");
} else {
  const dir = mkdtempSync(join(tmpdir(), "axmed-parser-test-"));
  try {
    const executable = join(dir, "parser-tests");
    execFileSync("swiftc", ["modules/axmed-hband/ios/HBandSampleBuilder.swift", "tests/hband-parser/main.swift", "-o", executable], { stdio: "inherit" });
    execFileSync(executable, [], { stdio: "inherit" });
  } finally {
    // Only the exact directory created by mkdtemp above, never a workspace path.
    rmSync(dir, { recursive: true, force: true });
  }
}
