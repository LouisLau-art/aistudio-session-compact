import { readFile } from "node:fs/promises";
import path from "node:path";

import { callGemini } from "../lib/gemini.js";
import { ensureDir, readNdjson, writeNdjson } from "../lib/fs.js";
import type { ImageEnrichment, SessionTurn } from "../types.js";

export interface EnrichImagesOptions {
  rawPath: string;
  outPath: string;
  model: string;
  apiKey?: string;
}

export function buildImagePrompt(contextText: string): string {
  return [
    "Analyze this conversation image and return strict JSON with keys:",
    "ocr_text, visual_summary, relevance_to_context.",
    "",
    "Requirements:",
    "- ocr_text: extracted readable text only",
    "- visual_summary: concise visual description",
    "- relevance_to_context: how image affects nearby discussion",
    "- no markdown, JSON only",
    "",
    "Nearby conversation context:",
    contextText.slice(0, 4000),
  ].join("\n");
}

export async function runEnrichImages(options: EnrichImagesOptions): Promise<{ outPath: string; count: number }> {
  const turns = await readNdjson<SessionTurn>(options.rawPath);
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for enrich-images command");
  }

  await ensureDir(path.dirname(options.outPath));

  const results: ImageEnrichment[] = [];

  for (const turn of turns) {
    for (const image of turn.images) {
      if (!image.localPath) {
        results.push({
          imageId: image.id,
          messageId: image.messageId,
          src: image.src,
          localPath: image.localPath,
          status: "skipped",
          error: "image file missing from capture stage",
        });
        continue;
      }

      try {
        const buffer = await readFile(image.localPath);
        const mimeType = guessMimeType(image.localPath);
        const contextText = turn.text;

        const response = await callGemini({
          model: options.model,
          apiKey,
          responseMimeType: "application/json",
          parts: [
            { text: buildImagePrompt(contextText) },
            {
              inline_data: {
                mime_type: mimeType,
                data: buffer.toString("base64"),
              },
            },
          ],
        });

        const parsed = parseImageJson(response.text);
        results.push({
          imageId: image.id,
          messageId: image.messageId,
          src: image.src,
          localPath: image.localPath,
          status: "ok",
          ocrText: parsed.ocr_text,
          visualSummary: parsed.visual_summary,
          relevanceToConversation: parsed.relevance_to_context,
          rawResponse: response.text,
        });
      } catch (error) {
        results.push({
          imageId: image.id,
          messageId: image.messageId,
          src: image.src,
          localPath: image.localPath,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await writeNdjson(options.outPath, results);
  return { outPath: options.outPath, count: results.length };
}

function parseImageJson(input: string): {
  ocr_text: string;
  visual_summary: string;
  relevance_to_context: string;
} {
  try {
    const parsed = JSON.parse(input) as Partial<{
      ocr_text: string;
      visual_summary: string;
      relevance_to_context: string;
    }>;

    return {
      ocr_text: parsed.ocr_text ?? "",
      visual_summary: parsed.visual_summary ?? "",
      relevance_to_context: parsed.relevance_to_context ?? "",
    };
  } catch {
    return {
      ocr_text: "",
      visual_summary: input.slice(0, 2000),
      relevance_to_context: "",
    };
  }
}

function guessMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}
