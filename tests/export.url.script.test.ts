import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "export-url-from-browser.sh");

describe("export-url browser wrapper script", () => {
  it("prints usage", () => {
    const result = spawnSync("bash", [scriptPath, "--help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("export-url-from-browser.sh <url>");
  });

  it("prints the browser startup and export commands in dry-run mode", () => {
    const result = spawnSync(
      "bash",
      [
        scriptPath,
        "https://chatgpt.com/c/69f76185-7c84-83a9-946e-e73fd0c877a4",
        "--browser",
        "chrome",
        "--port",
        "9333",
        "--out",
        "out/demo",
        "--dry-run",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("scripts/start-cdp-browser.sh chrome 9333");
    expect(result.stdout).toContain("bun run dev -- export-url");
    expect(result.stdout).toContain("--cdp-url http://127.0.0.1:9333");
    expect(result.stdout).toContain("--out out/demo");
  });
});
