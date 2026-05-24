import { spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildGeminiTurnsEvalExpression,
  extractGeminiConversationId,
  normalizeGeminiTurns,
  runExportGemini,
} from "../src/commands/exportGemini.js";

const sampleExtractedTurns = [
  {
    role: "user" as const,
    text: "帮我总结这段关系线索",
    roleHint: "gemini selector=user-query",
  },
  {
    role: "model" as const,
    text: "可以，关键事实有三点。",
    roleHint: "gemini selector=model-response",
  },
];

describe("Gemini conversation export", () => {
  it("extracts conversation ids from Gemini app URLs", () => {
    expect(extractGeminiConversationId("https://gemini.google.com/app/2efbea217799eaed")).toBe("2efbea217799eaed");
  });

  it("normalizes extracted Gemini DOM turns into ordered session turns", () => {
    const turns = normalizeGeminiTurns(sampleExtractedTurns, "https://gemini.google.com/app/2efbea217799eaed");

    expect(turns).toHaveLength(2);
    expect(turns.map((turn) => turn.role)).toEqual(["user", "model"]);
    expect(turns.map((turn) => turn.text)).toEqual(["帮我总结这段关系线索", "可以，关键事实有三点。"]);
    expect(turns[0].id).toBe("t-000001");
    expect(turns[0].sourceUrl).toBe("https://gemini.google.com/app/2efbea217799eaed");
  });

  it("builds a browser-evaluable extraction script without bundler helpers", () => {
    expect(buildGeminiTurnsEvalExpression()).not.toContain("__name");
    expect(buildGeminiTurnsEvalExpression()).toContain("extractGeminiTurns");
  });

  it("writes raw turns, transcript artifacts, and an export report", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    const runTranscript = vi.fn(async () => ({
      transcriptTxtPath: path.join(outDir, "transcript.txt"),
      transcriptMdPath: path.join(outDir, "transcript.md"),
      reportPath: path.join(outDir, "transcript.report.json"),
      turnCount: 2,
    }));

    const result = await runExportGemini(
      {
        outDir,
        cdpUrl: "http://127.0.0.1:9222",
        urlMatch: "gemini.google.com/app/",
        conversationUrl: "https://gemini.google.com/app/2efbea217799eaed",
      },
      {
        fetchTurns: async () => sampleExtractedTurns,
        runTranscript,
      },
    );

    const raw = await readFile(result.rawPath, "utf8");
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
      provider: string;
      conversationId: string;
      sourceUrl: string;
      rawPath: string;
      turnCount: number;
    };

    expect(raw).toContain("\"role\":\"user\"");
    expect(raw).toContain("可以，关键事实有三点。");
    expect(runTranscript).toHaveBeenCalledWith({
      rawPath: result.rawPath,
      outDir,
    });
    expect(report.provider).toBe("gemini");
    expect(report.conversationId).toBe("2efbea217799eaed");
    expect(report.sourceUrl).toBe("https://gemini.google.com/app/2efbea217799eaed");
    expect(report.rawPath).toBe(result.rawPath);
    expect(report.turnCount).toBe(2);
  });

  it("fails instead of writing an empty export when no Gemini turns are found", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "gemini-export-empty-"));

    await expect(
      runExportGemini(
        {
          outDir,
          cdpUrl: "http://127.0.0.1:9222",
          urlMatch: "gemini.google.com/app/",
          conversationUrl: "https://gemini.google.com/app/2efbea217799eaed",
        },
        {
          fetchTurns: async () => [],
          runTranscript: vi.fn(),
        },
      ),
    ).rejects.toThrow("No Gemini conversation turns found");
  });

  it("exposes an export-gemini CLI command", () => {
    const result = spawnSync("bun", ["run", "src/cli.ts", "--help"], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("export-gemini");
  });
});
