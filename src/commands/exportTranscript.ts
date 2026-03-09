import path from "node:path";

import { runCapture } from "./capture.js";
import { runEnrichImages } from "./enrichImages.js";
import { runTranscript } from "./transcript.js";
import type { VisionProvider } from "./enrichImages.js";
import type { OcrEngine } from "../lib/ocr.js";
import { writeJson } from "../lib/fs.js";

export interface ExportTranscriptOptions {
  outDir: string;
  cdpUrl: string;
  urlMatch: string;
  tabIndex?: number;
  strictCapture?: boolean;
  model: string;
  provider: VisionProvider;
  ocrEngine: OcrEngine;
  enableOcr: boolean;
  ocrLang: string;
  pythonBin?: string;
  doubaoApiKey?: string;
  doubaoBaseUrl?: string;
  maxScrollIterations: number;
  stableRounds: number;
  scrollWaitMs: number;
  maxImageScreenshots: number;
  withImages?: boolean;
}

export interface ExportTranscriptResult {
  rawPath: string;
  imagesPath?: string;
  imageRecordCount?: number;
  transcriptTxtPath: string;
  transcriptMdPath: string;
  transcriptReportPath: string;
  reportPath: string;
  turnCount: number;
}

interface ExportTranscriptDeps {
  runCapture: typeof runCapture;
  runEnrichImages: typeof runEnrichImages;
  runTranscript: typeof runTranscript;
}

const defaultDeps: ExportTranscriptDeps = {
  runCapture,
  runEnrichImages,
  runTranscript,
};

export async function runExportTranscript(
  options: ExportTranscriptOptions,
  deps: ExportTranscriptDeps = defaultDeps,
): Promise<ExportTranscriptResult> {
  const maxImageScreenshots = options.withImages ? options.maxImageScreenshots : 0;

  const capture = await deps.runCapture({
    cdpUrl: options.cdpUrl,
    urlMatch: options.urlMatch,
    outDir: options.outDir,
    maxScrollIterations: options.maxScrollIterations,
    stableRounds: options.stableRounds,
    scrollWaitMs: options.scrollWaitMs,
    tabIndex: options.tabIndex,
    strictCapture: options.strictCapture,
    maxImageScreenshots,
  });

  let imagesPath: string | undefined;
  let imageRecordCount: number | undefined;
  if (options.withImages) {
    const enrichment = await deps.runEnrichImages({
      rawPath: capture.rawPath,
      outPath: path.join(options.outDir, "images.enriched.jsonl"),
      model: options.model,
      provider: options.provider,
      ocrEngine: options.ocrEngine,
      enableOcr: options.enableOcr,
      ocrLang: options.ocrLang,
      pythonBin: options.pythonBin,
      doubaoApiKey: options.doubaoApiKey,
      doubaoBaseUrl: options.doubaoBaseUrl,
    });

    imagesPath = enrichment.outPath;
    imageRecordCount = enrichment.count;
  }

  const transcript = await deps.runTranscript({
    rawPath: capture.rawPath,
    imagesPath,
    outDir: options.outDir,
  });

  const reportPath = path.join(options.outDir, "export-transcript.report.json");
  await writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    rawPath: capture.rawPath,
    imagesPath,
    imageRecordCount,
    transcriptTxtPath: transcript.transcriptTxtPath,
    transcriptMdPath: transcript.transcriptMdPath,
    transcriptReportPath: transcript.reportPath,
    turnCount: transcript.turnCount,
  });

  return {
    rawPath: capture.rawPath,
    imagesPath,
    imageRecordCount,
    transcriptTxtPath: transcript.transcriptTxtPath,
    transcriptMdPath: transcript.transcriptMdPath,
    transcriptReportPath: transcript.reportPath,
    reportPath,
    turnCount: transcript.turnCount,
  };
}
