import { readFile } from "node:fs/promises";

import { buildContextCapsule, formatChunkForModel, heuristicChunkSummary } from "../lib/capsule.js";
import { chunkTurnsByChars } from "../lib/chunking.js";
import { callGemini } from "../lib/gemini.js";
import { readNdjson, writeJson } from "../lib/fs.js";
import type { ChunkSummary, ContextCapsule, ImageEnrichment, SessionTurn } from "../types.js";

export interface CompressOptions {
  rawPath: string;
  imagesPath?: string;
  outPath: string;
  model: string;
  chunkChars: number;
  apiKey?: string;
}

export function buildChunkPrompt(chunkText: string): string {
  return [
    "Summarize this conversation chunk into strict JSON with keys:",
    "summary, goals, decisions, constraints, open_questions, todos, key_facts.",
    "",
    "Rules:",
    "- Return JSON only.",
    "- Keep each list concise and deduplicated.",
    "- Preserve technical decisions and constraints exactly.",
    "",
    "Chunk:",
    chunkText,
  ].join("\n");
}

export async function runCompress(options: CompressOptions): Promise<{ outPath: string; capsule: ContextCapsule }> {
  const turns = await readNdjson<SessionTurn>(options.rawPath);
  const images = options.imagesPath
    ? await readNdjson<ImageEnrichment>(options.imagesPath)
    : ([] as ImageEnrichment[]);

  attachImageEnrichment(turns, images);

  const chunks = chunkTurnsByChars(turns, options.chunkChars);
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;

  const chunkSummaries: Array<{ turnIds: string[]; summary: ChunkSummary }> = [];

  for (const chunk of chunks) {
    const turnIds = chunk.map((turn) => turn.id);
    const body = formatChunkForModel(chunk);

    if (apiKey) {
      try {
        const response = await callGemini({
          model: options.model,
          apiKey,
          responseMimeType: "application/json",
          parts: [{ text: buildChunkPrompt(body) }],
        });

        chunkSummaries.push({
          turnIds,
          summary: parseChunkSummary(response.text),
        });
        continue;
      } catch {
        // Fall through to heuristic summary.
      }
    }

    chunkSummaries.push({
      turnIds,
      summary: heuristicChunkSummary(chunk),
    });
  }

  const capsule = buildContextCapsule({
    rawPath: options.rawPath,
    turns,
    chunkSummaries,
    modelUsed: options.model,
    mode: apiKey ? "llm" : "heuristic",
  });

  await writeJson(options.outPath, capsule);
  return { outPath: options.outPath, capsule };
}

function parseChunkSummary(text: string): ChunkSummary {
  try {
    const parsed = JSON.parse(text) as Partial<{
      summary: string;
      goals: string[];
      decisions: string[];
      constraints: string[];
      open_questions: string[];
      todos: string[];
      key_facts: string[];
    }>;

    return {
      summary: parsed.summary ?? "",
      goals: parsed.goals ?? [],
      decisions: parsed.decisions ?? [],
      constraints: parsed.constraints ?? [],
      openQuestions: parsed.open_questions ?? [],
      todos: parsed.todos ?? [],
      keyFacts: parsed.key_facts ?? [],
    };
  } catch {
    return {
      summary: text.slice(0, 1200),
      goals: [],
      decisions: [],
      constraints: [],
      openQuestions: [],
      todos: [],
      keyFacts: [],
    };
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
