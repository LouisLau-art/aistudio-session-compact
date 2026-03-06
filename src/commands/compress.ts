import { buildContextCapsule, heuristicChunkSummary } from "../lib/capsule.js";
import { applyBriefing, readBriefingFile } from "../lib/briefing.js";
import { chunkTurnsByChars } from "../lib/chunking.js";
import { readNdjson, writeJson } from "../lib/fs.js";
import type { ChunkSummary, ContextCapsule, ImageEnrichment, SessionTurn } from "../types.js";

export interface CompressOptions {
  rawPath: string;
  imagesPath?: string;
  briefingPath?: string;
  outPath: string;
  chunkChars: number;
}

export async function runCompress(options: CompressOptions): Promise<{ outPath: string; capsule: ContextCapsule }> {
  const turns = await readNdjson<SessionTurn>(options.rawPath);
  const images = options.imagesPath
    ? await readNdjson<ImageEnrichment>(options.imagesPath)
    : ([] as ImageEnrichment[]);

  attachImageEnrichment(turns, images);

  const chunks = chunkTurnsByChars(turns, options.chunkChars);

  const chunkSummaries: Array<{ turnIds: string[]; summary: ChunkSummary }> = [];

  for (const chunk of chunks) {
    const turnIds = chunk.map((turn) => turn.id);
    chunkSummaries.push({
      turnIds,
      summary: heuristicChunkSummary(chunk),
    });
  }

  const capsule = buildContextCapsule({
    rawPath: options.rawPath,
    turns,
    chunkSummaries,
    modelUsed: "heuristic-local",
    mode: "heuristic",
  });

  const briefing = options.briefingPath ? await readBriefingFile(options.briefingPath) : undefined;
  const augmentedCapsule = applyBriefing(capsule, briefing);

  await writeJson(options.outPath, augmentedCapsule);
  return { outPath: options.outPath, capsule: augmentedCapsule };
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
