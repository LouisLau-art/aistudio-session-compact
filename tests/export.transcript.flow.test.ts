import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runExportTranscript } from "../src/commands/exportTranscript.js";

describe("runExportTranscript", () => {
  it("writes a transcript-first report without image enrichment by default", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "export-transcript-"));

    const capture = vi.fn(async () => ({
      rawPath: "/tmp/session.raw.ndjson",
      reportPath: "/tmp/run-report.json",
      turns: [],
    }));
    const enrichImages = vi.fn();
    const transcript = vi.fn(async () => ({
      transcriptTxtPath: "/tmp/transcript.txt",
      transcriptMdPath: "/tmp/transcript.md",
      reportPath: "/tmp/transcript.report.json",
      turnCount: 42,
    }));

    const result = await runExportTranscript(
      {
        outDir,
        cdpUrl: "http://127.0.0.1:9222",
        urlMatch: "aistudio.google.com/prompts/demo",
        model: "vision-model",
        provider: "none",
        ocrEngine: "auto",
        enableOcr: false,
        ocrLang: "eng",
        maxScrollIterations: 10,
        stableRounds: 2,
        scrollWaitMs: 10,
        maxImageScreenshots: 0,
      },
      {
        runCapture: capture,
        runEnrichImages: enrichImages,
        runTranscript: transcript,
      },
    );

    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
      rawPath: string;
      imagesPath?: string;
      transcriptTxtPath: string;
      transcriptMdPath: string;
      turnCount: number;
    };

    expect(capture).toHaveBeenCalledOnce();
    expect(enrichImages).not.toHaveBeenCalled();
    expect(transcript).toHaveBeenCalledWith({
      rawPath: "/tmp/session.raw.ndjson",
      imagesPath: undefined,
      outDir,
    });
    expect(report.rawPath).toBe("/tmp/session.raw.ndjson");
    expect(report.imagesPath).toBeUndefined();
    expect(report.transcriptTxtPath).toBe("/tmp/transcript.txt");
    expect(report.transcriptMdPath).toBe("/tmp/transcript.md");
    expect(report.turnCount).toBe(42);
  });

  it("records image enrichment outputs when enabled", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "export-transcript-images-"));

    const result = await runExportTranscript(
      {
        outDir,
        cdpUrl: "http://127.0.0.1:9222",
        urlMatch: "aistudio.google.com/prompts/demo",
        model: "vision-model",
        provider: "none",
        ocrEngine: "auto",
        enableOcr: true,
        ocrLang: "eng+chi_sim",
        maxScrollIterations: 10,
        stableRounds: 2,
        scrollWaitMs: 10,
        maxImageScreenshots: 5,
        withImages: true,
      },
      {
        runCapture: async () => ({
          rawPath: "/tmp/session.raw.ndjson",
          reportPath: "/tmp/run-report.json",
          turns: [],
        }),
        runEnrichImages: async () => ({
          outPath: "/tmp/images.enriched.jsonl",
          count: 3,
        }),
        runTranscript: async () => ({
          transcriptTxtPath: "/tmp/transcript.txt",
          transcriptMdPath: "/tmp/transcript.md",
          reportPath: "/tmp/transcript.report.json",
          turnCount: 7,
        }),
      },
    );

    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
      imagesPath?: string;
      imageRecordCount?: number;
    };

    expect(report.imagesPath).toBe("/tmp/images.enriched.jsonl");
    expect(report.imageRecordCount).toBe(3);
  });
});
