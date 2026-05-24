import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { inferExportRoute, runExportUrl } from "../src/commands/exportUrl.js";

const baseOptions = {
  outDir: "/tmp/export-url-test",
  cdpUrl: "http://127.0.0.1:9222",
  provider: "none" as const,
  ocrEngine: "auto" as const,
  enableOcr: false,
  ocrLang: "eng+chi_sim",
  model: "vision-model",
  maxScrollIterations: 220,
  stableRounds: 6,
  scrollWaitMs: 900,
  maxImageScreenshots: 0,
};

describe("URL auto export", () => {
  it("infers exporter routes from supported URLs", () => {
    expect(inferExportRoute("https://aistudio.google.com/prompts/abc123")).toEqual({
      provider: "aistudio",
      urlMatch: "aistudio.google.com/prompts/abc123",
    });
    expect(inferExportRoute("https://chatgpt.com/c/69f76185-7c84-83a9-946e-e73fd0c877a4")).toEqual({
      provider: "chatgpt",
      urlMatch: "chatgpt.com/c/",
    });
    expect(inferExportRoute("https://gemini.google.com/app/2efbea217799eaed")).toEqual({
      provider: "gemini",
      urlMatch: "gemini.google.com/app/",
    });
  });

  it("runs the ChatGPT exporter for ChatGPT URLs", async () => {
    const runExportChatgpt = vi.fn(async () => ({
      rawPath: "/tmp/raw.ndjson",
      transcriptTxtPath: "/tmp/transcript.txt",
      transcriptMdPath: "/tmp/transcript.md",
      transcriptReportPath: "/tmp/transcript.report.json",
      reportPath: "/tmp/export-chatgpt.report.json",
      conversationId: "69f76185-7c84-83a9-946e-e73fd0c877a4",
      sourceUrl: "https://chatgpt.com/c/69f76185-7c84-83a9-946e-e73fd0c877a4",
      turnCount: 1,
    }));

    await runExportUrl(
      {
        ...baseOptions,
        url: "https://chatgpt.com/c/69f76185-7c84-83a9-946e-e73fd0c877a4",
      },
      {
        runExportChatgpt,
        runExportGemini: vi.fn(),
        runExportTranscript: vi.fn(),
      },
    );

    expect(runExportChatgpt).toHaveBeenCalledWith({
      outDir: baseOptions.outDir,
      cdpUrl: baseOptions.cdpUrl,
      urlMatch: "chatgpt.com/c/",
      conversationUrl: "https://chatgpt.com/c/69f76185-7c84-83a9-946e-e73fd0c877a4",
      tabIndex: undefined,
    });
  });

  it("exposes an export-url CLI command", () => {
    const result = spawnSync("bun", ["run", "src/cli.ts", "--help"], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("export-url");
  });
});
