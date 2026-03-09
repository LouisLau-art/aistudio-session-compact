import path from "node:path";

import { readBriefingFile } from "../lib/briefing.js";
import { selectPreservedTail } from "../lib/compaction-tail.js";
import { readNdjson, writeJson, writeNdjson } from "../lib/fs.js";
import { buildStateSnapshot } from "../lib/state-snapshot.js";
import type { ImageEnrichment, SessionTurn, StateSnapshot } from "../types.js";

const DEFAULT_TAIL_CHARS_BUDGET = 120_000;
const DEFAULT_MIN_TAIL_TURNS = 12;
const DEFAULT_MAX_TAIL_TURNS = 80;

export interface CompressOptions {
  rawPath: string;
  imagesPath?: string;
  briefingPath?: string;
  outDir: string;
  tailCharsBudget?: number;
  minTailTurns?: number;
  maxTailTurns?: number;
}

export interface CompressReport {
  generatedAt: string;
  rawPath: string;
  imagesPath?: string;
  snapshotPath: string;
  tailPath: string;
  turnCount: number;
  tailTurnCount: number;
  tailChars: number;
  imageCount: number;
  briefingApplied: boolean;
  warnings: string[];
}

export async function runCompress(options: CompressOptions): Promise<{
  outDir: string;
  snapshotPath: string;
  tailPath: string;
  reportPath: string;
  snapshot: StateSnapshot;
}> {
  const turns = await readNdjson<SessionTurn>(options.rawPath);
  const warnings: string[] = [];

  const images = await readImageEnrichment(options.imagesPath, warnings);
  if (!options.imagesPath) {
    warnings.push("Image enrichment not provided; continuing with text-only compaction.");
  }
  attachImageEnrichment(turns, images);

  const briefing = options.briefingPath ? await readBriefingFile(options.briefingPath) : undefined;
  const preservedTail = selectPreservedTail(turns, {
    tailCharsBudget: options.tailCharsBudget ?? DEFAULT_TAIL_CHARS_BUDGET,
    minTailTurns: options.minTailTurns ?? DEFAULT_MIN_TAIL_TURNS,
    maxTailTurns: options.maxTailTurns ?? DEFAULT_MAX_TAIL_TURNS,
  });

  const snapshot = buildStateSnapshot({
    rawPath: options.rawPath,
    turns,
    preservedTail,
    modelUsed: "heuristic-local",
    mode: "heuristic",
    briefing,
    briefingPath: options.briefingPath,
  });

  const outDir = path.resolve(options.outDir);
  const snapshotPath = path.join(outDir, "state_snapshot.json");
  const tailPath = path.join(outDir, "preserved_tail.ndjson");
  const reportPath = path.join(outDir, "compress.report.json");

  await writeJson(snapshotPath, snapshot);
  await writeNdjson(tailPath, preservedTail);

  const report: CompressReport = {
    generatedAt: new Date().toISOString(),
    rawPath: options.rawPath,
    imagesPath: options.imagesPath,
    snapshotPath,
    tailPath,
    turnCount: turns.length,
    tailTurnCount: preservedTail.length,
    tailChars: preservedTail.reduce((total, turn) => total + turn.text.length, 0),
    imageCount: turns.reduce((total, turn) => total + turn.images.length, 0),
    briefingApplied: Boolean(briefing),
    warnings,
  };

  await writeJson(reportPath, report);

  return {
    outDir,
    snapshotPath,
    tailPath,
    reportPath,
    snapshot,
  };
}

async function readImageEnrichment(
  imagesPath: string | undefined,
  warnings: string[],
): Promise<ImageEnrichment[]> {
  if (!imagesPath) {
    return [];
  }

  try {
    return await readNdjson<ImageEnrichment>(imagesPath);
  } catch (error) {
    warnings.push(`Image enrichment unavailable at ${imagesPath}: ${toErrorMessage(error)}`);
    return [];
  }
}

function attachImageEnrichment(turns: SessionTurn[], images: ImageEnrichment[]): void {
  const byImageId = new Map(images.map((image) => [image.imageId, image]));

  for (const turn of turns) {
    const additions: string[] = [];
    for (const image of turn.images) {
      const enrichment = byImageId.get(image.id);
      if (!enrichment || enrichment.status !== "ok") continue;

      const snippet = [
        enrichment.ocrText ? `OCR: ${enrichment.ocrText}` : "",
        enrichment.visualSummary ? `Visual: ${enrichment.visualSummary}` : "",
        enrichment.relevanceToConversation ? `Relevance: ${enrichment.relevanceToConversation}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      if (snippet) additions.push(`[Image ${image.id}] ${snippet}`);
    }

    if (additions.length) {
      turn.text = `${turn.text}\n\n${additions.join("\n")}`;
    }
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
