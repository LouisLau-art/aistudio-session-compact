import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/commands/capture.js", () => ({
  runCapture: vi.fn(),
}));

vi.mock("../src/commands/enrichImages.js", () => ({
  runEnrichImages: vi.fn(),
}));

vi.mock("../src/commands/transcript.js", () => ({
  runTranscript: vi.fn(),
}));

import { runCapture } from "../src/commands/capture.js";
import { runEnrichImages } from "../src/commands/enrichImages.js";
import { runExportTranscript } from "../src/commands/exportTranscript.js";
import { runTranscript } from "../src/commands/transcript.js";

const mockedRunCapture = runCapture as unknown as ReturnType<typeof vi.fn>;
const mockedRunEnrichImages = runEnrichImages as unknown as ReturnType<typeof vi.fn>;
const mockedRunTranscript = runTranscript as unknown as ReturnType<typeof vi.fn>;

describe("runExportTranscript", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs capture, image enrichment, transcript export, and writes a report", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "export-transcript-"));
    const rawPath = path.join(outDir, "session.raw.ndjson");
    const imagesPath = path.join(outDir, "images.enriched.jsonl");
    const transcriptTxtPath = path.join(outDir, "transcript.txt");
    const transcriptMdPath = path.join(outDir, "transcript.md");
    const reportPath = path.join(outDir, "export-transcript.report.json");

    mockedRunCapture.mockResolvedValue({
      rawPath,
      reportPath: path.join(outDir, "run-report.json"),
      turns: [],
    });
    mockedRunEnrichImages.mockResolvedValue({
      outPath: imagesPath,
      count: 0,
    });
    mockedRunTranscript.mockResolvedValue({
      transcriptTxtPath,
      transcriptMdPath,
      reportPath: path.join(outDir, "transcript.report.json"),
      turnCount: 42,
    });

    const result = await runExportTranscript({
      outDir,
      cdpUrl: "http://127.0.0.1:9222",
      urlMatch: "aistudio.google.com/prompts/demo",
      model: "vision-model",
      provider: "none",
      ocrEngine: "auto",
      enableOcr: true,
      ocrLang: "eng+chi_sim",
      maxScrollIterations: 220,
      stableRounds: 6,
      scrollWaitMs: 900,
      maxImageScreenshots: 80,
    });

    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      rawPath: string;
      imagesPath: string;
      transcriptTxtPath: string;
      transcriptMdPath: string;
      transcriptReportPath: string;
    };

    expect(runCapture).toHaveBeenCalledOnce();
    expect(runEnrichImages).toHaveBeenCalledOnce();
    expect(runTranscript).toHaveBeenCalledOnce();
    expect(result.transcriptTxtPath).toBe(transcriptTxtPath);
    expect(result.transcriptMdPath).toBe(transcriptMdPath);
    expect(report.rawPath).toBe(rawPath);
    expect(report.imagesPath).toBe(imagesPath);
    expect(report.transcriptTxtPath).toBe(transcriptTxtPath);
    expect(report.transcriptMdPath).toBe(transcriptMdPath);
  });
});
