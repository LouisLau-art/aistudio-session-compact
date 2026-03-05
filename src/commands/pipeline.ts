import path from "node:path";

import { runCapture } from "./capture.js";
import { runCompress } from "./compress.js";
import { runEnrichImages } from "./enrichImages.js";
import type { VisionProvider } from "./enrichImages.js";
import type { OcrEngine } from "../lib/ocr.js";
import { runHandoff } from "./handoff.js";
import { writeJson } from "../lib/fs.js";

export interface PipelineOptions {
  outDir: string;
  cdpUrl: string;
  urlMatch: string;
  tabIndex?: number;
  model: string;
  provider: VisionProvider;
  ocrEngine: OcrEngine;
  enableOcr: boolean;
  ocrLang: string;
  pythonBin?: string;
  doubaoApiKey?: string;
  doubaoBaseUrl?: string;
  geminiApiKey?: string;
  chunkChars: number;
  maxScrollIterations: number;
  stableRounds: number;
  scrollWaitMs: number;
}

export async function runPipeline(options: PipelineOptions): Promise<void> {
  const capture = await runCapture({
    cdpUrl: options.cdpUrl,
    urlMatch: options.urlMatch,
    outDir: options.outDir,
    maxScrollIterations: options.maxScrollIterations,
    stableRounds: options.stableRounds,
    scrollWaitMs: options.scrollWaitMs,
    tabIndex: options.tabIndex,
  });

  const imagesOut = path.join(options.outDir, "images.enriched.jsonl");
  const compressionOut = path.join(options.outDir, "context_capsule.json");

  await runEnrichImages({
    rawPath: capture.rawPath,
    outPath: imagesOut,
    model: options.model,
    provider: options.provider,
    ocrEngine: options.ocrEngine,
    enableOcr: options.enableOcr,
    ocrLang: options.ocrLang,
    pythonBin: options.pythonBin,
    doubaoApiKey: options.doubaoApiKey,
    doubaoBaseUrl: options.doubaoBaseUrl,
    apiKey: options.geminiApiKey,
  });

  const compress = await runCompress({
    rawPath: capture.rawPath,
    imagesPath: imagesOut,
    outPath: compressionOut,
    model: options.model,
    chunkChars: options.chunkChars,
  });

  const handoff = await runHandoff({
    capsulePath: compress.outPath,
    outDir: options.outDir,
  });

  await writeJson(path.join(options.outDir, "pipeline.report.json"), {
    generatedAt: new Date().toISOString(),
    rawPath: capture.rawPath,
    imagesPath: imagesOut,
    capsulePath: compress.outPath,
    handoffPath: handoff.handoffPath,
    resumePromptPath: handoff.resumePromptPath,
  });
}
