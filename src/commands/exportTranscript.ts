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
}

export interface ExportTranscriptResult {
  rawPath: string;
  imagesPath: string;
  transcriptTxtPath: string;
  transcriptMdPath: string;
  transcriptReportPath: string;
  reportPath: string;
}

export async function runExportTranscript(options: ExportTranscriptOptions): Promise<ExportTranscriptResult> {
  const capture = await runCapture({
    cdpUrl: options.cdpUrl,
    urlMatch: options.urlMatch,
    outDir: options.outDir,
    maxScrollIterations: options.maxScrollIterations,
    stableRounds: options.stableRounds,
    scrollWaitMs: options.scrollWaitMs,
    tabIndex: options.tabIndex,
    strictCapture: options.strictCapture,
    maxImageScreenshots: options.maxImageScreenshots,
  });

  const imagesPath = path.join(options.outDir, "images.enriched.jsonl");
  const transcript = await runTranscript({
    rawPath: capture.rawPath,
    imagesPath:
      (
        await runEnrichImages({
          rawPath: capture.rawPath,
          outPath: imagesPath,
          model: options.model,
          provider: options.provider,
          ocrEngine: options.ocrEngine,
          enableOcr: options.enableOcr,
          ocrLang: options.ocrLang,
          pythonBin: options.pythonBin,
          doubaoApiKey: options.doubaoApiKey,
          doubaoBaseUrl: options.doubaoBaseUrl,
        })
      ).outPath,
    outDir: options.outDir,
  });

  const reportPath = path.join(options.outDir, "export-transcript.report.json");
  await writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    rawPath: capture.rawPath,
    imagesPath,
    transcriptTxtPath: transcript.transcriptTxtPath,
    transcriptMdPath: transcript.transcriptMdPath,
    transcriptReportPath: transcript.reportPath,
  });

  return {
    rawPath: capture.rawPath,
    imagesPath,
    transcriptTxtPath: transcript.transcriptTxtPath,
    transcriptMdPath: transcript.transcriptMdPath,
    transcriptReportPath: transcript.reportPath,
    reportPath,
  };
}
