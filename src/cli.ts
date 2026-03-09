#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";

import { runCapture } from "./commands/capture.js";
import { runCompress } from "./commands/compress.js";
import type { VisionProvider } from "./commands/enrichImages.js";
import { runEnrichImages } from "./commands/enrichImages.js";
import { runExportTranscript } from "./commands/exportTranscript.js";
import { runHandoff } from "./commands/handoff.js";
import { runPipeline } from "./commands/pipeline.js";
import { runTranscript } from "./commands/transcript.js";
import type { OcrEngine } from "./lib/ocr.js";

const program = new Command();

program
  .name("aistudio-session-compact")
  .description("Capture and compact long Google AI Studio sessions")
  .version("0.1.0");

program
  .command("capture")
  .description("Capture current AI Studio session from Chrome CDP tab")
  .option("--cdp-url <url>", "Chrome CDP endpoint", "http://127.0.0.1:9222")
  .option("--url-match <text>", "URL substring to identify target tab", "aistudio.google.com/prompts/")
  .option("--out <dir>", "Output directory", "./out")
  .option("--max-scroll-iterations <n>", "Max loading loops", parseIntValue, 220)
  .option("--stable-rounds <n>", "Stop after N stable rounds", parseIntValue, 6)
  .option("--scroll-wait-ms <n>", "Wait time per loop (ms)", parseIntValue, 900)
  .option("--max-image-screenshots <n>", "Cap local image screenshots", parseIntValue, 80)
  .option("--tab-index <n>", "Pick a tab index explicitly", parseOptionalInt)
  .option("--no-strict-capture", "Allow capture output even when quality gate fails")
  .action(async (opts) => {
    const result = await runCapture({
      cdpUrl: opts.cdpUrl,
      urlMatch: opts.urlMatch,
      outDir: path.resolve(opts.out),
      maxScrollIterations: opts.maxScrollIterations,
      stableRounds: opts.stableRounds,
      scrollWaitMs: opts.scrollWaitMs,
      maxImageScreenshots: opts.maxImageScreenshots,
      tabIndex: opts.tabIndex,
      strictCapture: opts.strictCapture,
    });

    console.log(`Captured ${result.turns.length} turns`);
    console.log(`Raw: ${result.rawPath}`);
    console.log(`Report: ${result.reportPath}`);
  });

program
  .command("enrich-images")
  .description("Run OCR + visual summary for captured images")
  .requiredOption("--raw <path>", "Path to session.raw.ndjson")
  .option("--out <path>", "Output images.enriched.jsonl", "./out/images.enriched.jsonl")
  .option("--provider <name>", "Vision provider: auto|doubao|none", parseVisionProvider, "auto")
  .option("--ocr-engine <name>", "OCR engine: auto|tesseract|paddle", parseOcrEngine, "auto")
  .option("--model <model>", "Vision model id", process.env.VISION_MODEL ?? "vision-model")
  .option("--disable-ocr", "Disable local Tesseract OCR", false)
  .option("--ocr-lang <lang>", "Tesseract OCR language", process.env.OCR_LANG ?? "eng+chi_sim")
  .option("--python-bin <path>", "Python binary for PaddleOCR sidecar", process.env.OCR_PYTHON_BIN ?? "python3")
  .option("--doubao-api-key <key>", "Doubao API key")
  .option("--doubao-base-url <url>", "Doubao/OpenAI-compatible base URL", process.env.DOUBAO_BASE_URL)
  .action(async (opts) => {
    const result = await runEnrichImages({
      rawPath: path.resolve(opts.raw),
      outPath: path.resolve(opts.out),
      model: opts.model,
      provider: opts.provider,
      ocrEngine: opts.ocrEngine,
      enableOcr: !opts.disableOcr,
      ocrLang: opts.ocrLang,
      pythonBin: opts.pythonBin,
      doubaoApiKey: opts.doubaoApiKey,
      doubaoBaseUrl: opts.doubaoBaseUrl,
    });

    console.log(`Enriched image records: ${result.count}`);
    console.log(`Output: ${result.outPath}`);
  });

program
  .command("compress")
  .description("Compress captured session into context capsule (heuristic)")
  .requiredOption("--raw <path>", "Path to session.raw.ndjson")
  .option("--images <path>", "Path to images.enriched.jsonl")
  .option("--briefing <path>", "Optional JSON briefing with background + people map")
  .option("--out <path>", "Output context_capsule.json", "./out/context_capsule.json")
  .option("--chunk-chars <n>", "Chunk size by chars", parseIntValue, 20000)
  .action(async (opts) => {
    const result = await runCompress({
      rawPath: path.resolve(opts.raw),
      imagesPath: opts.images ? path.resolve(opts.images) : undefined,
      briefingPath: opts.briefing ? path.resolve(opts.briefing) : undefined,
      outPath: path.resolve(opts.out),
      chunkChars: opts.chunkChars,
    });

    console.log(`Capsule created with ${result.capsule.meta.chunkCount} chunks`);
    console.log(`Output: ${result.outPath}`);
  });

program
  .command("transcript")
  .description("Render transcript.txt and transcript.md from captured session data")
  .requiredOption("--raw <path>", "Path to session.raw.ndjson")
  .option("--images <path>", "Path to images.enriched.jsonl")
  .option("--out-dir <dir>", "Output directory", "./out")
  .action(async (opts) => {
    const result = await runTranscript({
      rawPath: path.resolve(opts.raw),
      imagesPath: opts.images ? path.resolve(opts.images) : undefined,
      outDir: path.resolve(opts.outDir),
    });

    console.log(`Transcript text: ${result.transcriptTxtPath}`);
    console.log(`Transcript markdown: ${result.transcriptMdPath}`);
    console.log(`Report: ${result.reportPath}`);
  });

program
  .command("handoff")
  .description("Generate markdown handoff + resume prompt")
  .requiredOption("--capsule <path>", "Path to context_capsule.json")
  .option("--briefing <path>", "Optional JSON briefing with background + people map")
  .option("--out-dir <dir>", "Output directory", "./out")
  .action(async (opts) => {
    const result = await runHandoff({
      capsulePath: path.resolve(opts.capsule),
      briefingPath: opts.briefing ? path.resolve(opts.briefing) : undefined,
      outDir: path.resolve(opts.outDir),
    });

    console.log(`Handoff: ${result.handoffPath}`);
    console.log(`Resume prompt: ${result.resumePromptPath}`);
  });

program
  .command("pipeline")
  .description("Run capture -> enrich-images -> compress -> handoff")
  .option("--cdp-url <url>", "Chrome CDP endpoint", "http://127.0.0.1:9222")
  .option("--url-match <text>", "URL match for target tab", "aistudio.google.com/prompts/")
  .option("--tab-index <n>", "Pick a tab index explicitly", parseOptionalInt)
  .option("--briefing <path>", "Optional JSON briefing with background + people map")
  .option("--out <dir>", "Output directory", "./out")
  .option("--provider <name>", "Vision provider: auto|doubao|none", parseVisionProvider, "auto")
  .option("--ocr-engine <name>", "OCR engine: auto|tesseract|paddle", parseOcrEngine, "auto")
  .option("--model <model>", "Vision model id", process.env.VISION_MODEL ?? "vision-model")
  .option("--disable-ocr", "Disable local Tesseract OCR", false)
  .option("--ocr-lang <lang>", "Tesseract OCR language", process.env.OCR_LANG ?? "eng+chi_sim")
  .option("--python-bin <path>", "Python binary for PaddleOCR sidecar", process.env.OCR_PYTHON_BIN ?? "python3")
  .option("--doubao-api-key <key>", "Doubao API key")
  .option("--doubao-base-url <url>", "Doubao/OpenAI-compatible base URL", process.env.DOUBAO_BASE_URL)
  .option("--chunk-chars <n>", "Chunk size by chars", parseIntValue, 20000)
  .option("--max-scroll-iterations <n>", "Max loading loops", parseIntValue, 220)
  .option("--stable-rounds <n>", "Stop after N stable rounds", parseIntValue, 6)
  .option("--scroll-wait-ms <n>", "Wait time per loop (ms)", parseIntValue, 900)
  .option("--max-image-screenshots <n>", "Cap local image screenshots", parseIntValue, 80)
  .option("--no-strict-capture", "Allow capture output even when quality gate fails")
  .action(async (opts) => {
    await runPipeline({
      outDir: path.resolve(opts.out),
      cdpUrl: opts.cdpUrl,
      urlMatch: opts.urlMatch,
      tabIndex: opts.tabIndex,
      briefingPath: opts.briefing ? path.resolve(opts.briefing) : undefined,
      strictCapture: opts.strictCapture,
      model: opts.model,
      provider: opts.provider,
      ocrEngine: opts.ocrEngine,
      enableOcr: !opts.disableOcr,
      ocrLang: opts.ocrLang,
      pythonBin: opts.pythonBin,
      doubaoApiKey: opts.doubaoApiKey,
      doubaoBaseUrl: opts.doubaoBaseUrl,
      chunkChars: opts.chunkChars,
      maxScrollIterations: opts.maxScrollIterations,
      stableRounds: opts.stableRounds,
      scrollWaitMs: opts.scrollWaitMs,
      maxImageScreenshots: opts.maxImageScreenshots,
    });

    console.log(`Pipeline completed. Output dir: ${path.resolve(opts.out)}`);
  });

program
  .command("export-transcript")
  .description("Run capture -> enrich-images -> transcript export")
  .option("--cdp-url <url>", "Chrome CDP endpoint", "http://127.0.0.1:9222")
  .option("--url-match <text>", "URL match for target tab", "aistudio.google.com/prompts/")
  .option("--tab-index <n>", "Pick a tab index explicitly", parseOptionalInt)
  .option("--out <dir>", "Output directory", "./out")
  .option("--provider <name>", "Vision provider: auto|doubao|none", parseVisionProvider, "auto")
  .option("--ocr-engine <name>", "OCR engine: auto|tesseract|paddle", parseOcrEngine, "auto")
  .option("--model <model>", "Vision model id", process.env.VISION_MODEL ?? "vision-model")
  .option("--disable-ocr", "Disable local Tesseract OCR", false)
  .option("--ocr-lang <lang>", "Tesseract OCR language", process.env.OCR_LANG ?? "eng+chi_sim")
  .option("--python-bin <path>", "Python binary for PaddleOCR sidecar", process.env.OCR_PYTHON_BIN ?? "python3")
  .option("--doubao-api-key <key>", "Doubao API key")
  .option("--doubao-base-url <url>", "Doubao/OpenAI-compatible base URL", process.env.DOUBAO_BASE_URL)
  .option("--max-scroll-iterations <n>", "Max loading loops", parseIntValue, 220)
  .option("--stable-rounds <n>", "Stop after N stable rounds", parseIntValue, 6)
  .option("--scroll-wait-ms <n>", "Wait time per loop (ms)", parseIntValue, 900)
  .option("--max-image-screenshots <n>", "Cap local image screenshots", parseIntValue, 80)
  .option("--no-strict-capture", "Allow capture output even when quality gate fails")
  .action(async (opts) => {
    const result = await runExportTranscript({
      outDir: path.resolve(opts.out),
      cdpUrl: opts.cdpUrl,
      urlMatch: opts.urlMatch,
      tabIndex: opts.tabIndex,
      strictCapture: opts.strictCapture,
      model: opts.model,
      provider: opts.provider,
      ocrEngine: opts.ocrEngine,
      enableOcr: !opts.disableOcr,
      ocrLang: opts.ocrLang,
      pythonBin: opts.pythonBin,
      doubaoApiKey: opts.doubaoApiKey,
      doubaoBaseUrl: opts.doubaoBaseUrl,
      maxScrollIterations: opts.maxScrollIterations,
      stableRounds: opts.stableRounds,
      scrollWaitMs: opts.scrollWaitMs,
      maxImageScreenshots: opts.maxImageScreenshots,
    });

    console.log(`Transcript text: ${result.transcriptTxtPath}`);
    console.log(`Transcript markdown: ${result.transcriptMdPath}`);
    console.log(`Report: ${result.reportPath}`);
  });

program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

function parseIntValue(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer: ${value}`);
  }
  return parsed;
}

function parseOptionalInt(value: string): number {
  return parseIntValue(value);
}

function parseVisionProvider(value: string): VisionProvider {
  if (value === "auto" || value === "doubao" || value === "none") {
    return value;
  }
  throw new Error(`Invalid vision provider: ${value}`);
}

function parseOcrEngine(value: string): OcrEngine {
  if (value === "auto" || value === "tesseract" || value === "paddle") {
    return value;
  }
  throw new Error(`Invalid OCR engine: ${value}`);
}
