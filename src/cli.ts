#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";

import { runCapture } from "./commands/capture.js";
import { runCompress } from "./commands/compress.js";
import { runEnrichImages } from "./commands/enrichImages.js";
import { runHandoff } from "./commands/handoff.js";
import { runPipeline } from "./commands/pipeline.js";

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
  .option("--tab-index <n>", "Pick a tab index explicitly", parseOptionalInt)
  .action(async (opts) => {
    const result = await runCapture({
      cdpUrl: opts.cdpUrl,
      urlMatch: opts.urlMatch,
      outDir: path.resolve(opts.out),
      maxScrollIterations: opts.maxScrollIterations,
      stableRounds: opts.stableRounds,
      scrollWaitMs: opts.scrollWaitMs,
      tabIndex: opts.tabIndex,
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
  .option("--model <model>", "Gemini model", process.env.GEMINI_MODEL ?? "gemini-3-flash-preview")
  .option("--api-key <key>", "Gemini API key")
  .action(async (opts) => {
    const result = await runEnrichImages({
      rawPath: path.resolve(opts.raw),
      outPath: path.resolve(opts.out),
      model: opts.model,
      apiKey: opts.apiKey,
    });

    console.log(`Enriched image records: ${result.count}`);
    console.log(`Output: ${result.outPath}`);
  });

program
  .command("compress")
  .description("Compress captured session into context capsule")
  .requiredOption("--raw <path>", "Path to session.raw.ndjson")
  .option("--images <path>", "Path to images.enriched.jsonl")
  .option("--out <path>", "Output context_capsule.json", "./out/context_capsule.json")
  .option("--model <model>", "Gemini model", process.env.GEMINI_MODEL ?? "gemini-3-flash-preview")
  .option("--chunk-chars <n>", "Chunk size by chars", parseIntValue, 20000)
  .option("--api-key <key>", "Gemini API key")
  .action(async (opts) => {
    const result = await runCompress({
      rawPath: path.resolve(opts.raw),
      imagesPath: opts.images ? path.resolve(opts.images) : undefined,
      outPath: path.resolve(opts.out),
      model: opts.model,
      chunkChars: opts.chunkChars,
      apiKey: opts.apiKey,
    });

    console.log(`Capsule created with ${result.capsule.meta.chunkCount} chunks`);
    console.log(`Output: ${result.outPath}`);
  });

program
  .command("handoff")
  .description("Generate markdown handoff + resume prompt")
  .requiredOption("--capsule <path>", "Path to context_capsule.json")
  .option("--out-dir <dir>", "Output directory", "./out")
  .action(async (opts) => {
    const result = await runHandoff({
      capsulePath: path.resolve(opts.capsule),
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
  .option("--out <dir>", "Output directory", "./out")
  .option("--model <model>", "Gemini model", process.env.GEMINI_MODEL ?? "gemini-3-flash-preview")
  .option("--chunk-chars <n>", "Chunk size by chars", parseIntValue, 20000)
  .option("--max-scroll-iterations <n>", "Max loading loops", parseIntValue, 220)
  .option("--stable-rounds <n>", "Stop after N stable rounds", parseIntValue, 6)
  .option("--scroll-wait-ms <n>", "Wait time per loop (ms)", parseIntValue, 900)
  .action(async (opts) => {
    await runPipeline({
      outDir: path.resolve(opts.out),
      cdpUrl: opts.cdpUrl,
      urlMatch: opts.urlMatch,
      model: opts.model,
      chunkChars: opts.chunkChars,
      maxScrollIterations: opts.maxScrollIterations,
      stableRounds: opts.stableRounds,
      scrollWaitMs: opts.scrollWaitMs,
    });

    console.log(`Pipeline completed. Output dir: ${path.resolve(opts.out)}`);
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
