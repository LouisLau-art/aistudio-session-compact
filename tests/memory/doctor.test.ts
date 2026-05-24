import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { collectMemoryDoctorReport, renderMemoryDoctorReport } from "../../src/lib/memory/doctor.js";

describe("memory doctor", () => {
  test("reports ready without exposing secret values", async () => {
    const cwd = await makeMemoryFixture();
    const env = {
      SILICONFLOW_API_KEY: "sf-secret-value",
      LLM_API_KEY: "llm-secret-value",
      DASHSCOPE_API_KEY: "dashscope-secret-value",
    };

    const report = collectMemoryDoctorReport({ cwd, env });
    const rendered = renderMemoryDoctorReport(report);

    expect(report.ready).toBe(true);
    expect(rendered).toContain("SILICONFLOW_API_KEY: SET");
    expect(rendered).toContain("LLM_API_KEY or ARK_API_KEY: SET");
    expect(rendered).toContain("DASHSCOPE_API_KEY: SET");
    expect(rendered).not.toContain("secret-value");
  });

  test("marks missing required keys and missing memory data", async () => {
    const cwd = await makeMemoryFixture({ withChroma: false });

    const report = collectMemoryDoctorReport({ cwd, env: {} });
    const rendered = renderMemoryDoctorReport(report);

    expect(report.ready).toBe(false);
    expect(rendered).toContain("SILICONFLOW_API_KEY: MISSING");
    expect(rendered).toContain("LLM_API_KEY or ARK_API_KEY: MISSING");
    expect(rendered).toContain("memory/chroma: MISSING");
    expect(rendered).toContain("Result: NOT READY");
  });

  test("does not require LLM key for query-ready status", async () => {
    const cwd = await makeMemoryFixture();
    const report = collectMemoryDoctorReport({
      cwd,
      env: { SILICONFLOW_API_KEY: "sf-secret-value" },
    });
    const rendered = renderMemoryDoctorReport(report);

    expect(report.ready).toBe(true);
    expect(rendered).toContain("[WARN] LLM_API_KEY or ARK_API_KEY: MISSING");
    expect(rendered).not.toContain("secret-value");
    expect(rendered).toContain("Result: READY");
  });

  test("does not require an existing chroma index for build readiness", async () => {
    const cwd = await makeMemoryFixture({ withChroma: false });
    const report = collectMemoryDoctorReport({
      cwd,
      env: { SILICONFLOW_API_KEY: "sf-secret-value" },
      mode: "build",
    });
    const rendered = renderMemoryDoctorReport(report);

    expect(report.ready).toBe(true);
    expect(rendered).toContain("[WARN] memory/chroma: MISSING");
    expect(rendered).toContain("will be created by memory:build");
    expect(rendered).toContain("Result: READY");
  });
});

async function makeMemoryFixture(options: { withChroma?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "memory-doctor-"));
  await mkdir(path.join(root, "memory-system", "src"), { recursive: true });
  await writeFile(path.join(root, "memory-system", "src", "cli.py"), "");

  if (options.withChroma !== false) {
    await mkdir(path.join(root, "memory", "chroma"), { recursive: true });
  }

  return root;
}
