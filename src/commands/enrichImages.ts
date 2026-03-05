import { readFile } from "node:fs/promises";
import path from "node:path";

import { callDoubaoVision } from "../lib/doubao.js";
import {
  resolveOcrEngine,
  runPaddleOcr,
  runTesseractOcr,
  type OcrEngine,
  type ResolvedOcrEngine,
} from "../lib/ocr.js";
import { ensureDir, readNdjson, writeNdjson } from "../lib/fs.js";
import type { ImageEnrichment, SessionTurn } from "../types.js";

export type VisionProvider = "auto" | "doubao" | "none";
export type ResolvedVisionProvider = "doubao" | "none";

export interface EnrichImagesOptions {
  rawPath: string;
  outPath: string;
  model: string;
  provider?: VisionProvider;
  ocrEngine?: OcrEngine;
  enableOcr?: boolean;
  ocrLang?: string;
  pythonBin?: string;
  doubaoApiKey?: string;
  doubaoBaseUrl?: string;
}

export function buildImagePrompt(contextText: string, ocrHint?: string): string {
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
    "OCR hint (from local OCR, may be noisy):",
    ocrHint && ocrHint.trim().length ? ocrHint.slice(0, 3000) : "(none)",
    "",
    "Nearby conversation context:",
    contextText.slice(0, 4000),
  ].join("\n");
}

export function selectVisionProvider(input: {
  provider: VisionProvider;
  doubaoApiKey?: string;
}): ResolvedVisionProvider {
  if (input.provider === "none") {
    return "none";
  }

  if (input.provider === "doubao") {
    return input.doubaoApiKey ? "doubao" : "none";
  }

  if (input.doubaoApiKey) {
    return "doubao";
  }
  return "none";
}

export async function runEnrichImages(options: EnrichImagesOptions): Promise<{ outPath: string; count: number }> {
  const turns = await readNdjson<SessionTurn>(options.rawPath);
  const doubaoApiKey = options.doubaoApiKey ?? process.env.DOUBAO_API_KEY;
  const provider = selectVisionProvider({
    provider: options.provider ?? "auto",
    doubaoApiKey,
  });
  const ocrEngine = options.ocrEngine ?? "auto";
  const ocrLang = options.ocrLang ?? process.env.OCR_LANG ?? "eng+chi_sim";
  const enableOcr = options.enableOcr ?? true;
  const pythonBin = options.pythonBin ?? process.env.OCR_PYTHON_BIN ?? "python3";
  const resolvedOcrEngine: ResolvedOcrEngine = enableOcr
    ? await resolveOcrEngine(ocrEngine, pythonBin)
    : "none";

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

      let ocrText = "";
      let ocrError = "";

      if (enableOcr && resolvedOcrEngine !== "none") {
        try {
          ocrText =
            resolvedOcrEngine === "paddle"
              ? await runPaddleOcr(image.localPath, ocrLang, pythonBin)
              : await runTesseractOcr(image.localPath, ocrLang);
        } catch (error) {
          const primaryError = error instanceof Error ? error.message : String(error);

          if (resolvedOcrEngine === "paddle") {
            try {
              ocrText = await runTesseractOcr(image.localPath, ocrLang);
              ocrError = `paddle failed, fallback tesseract used: ${primaryError}`;
            } catch (fallbackError) {
              const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
              ocrError = `paddle failed: ${primaryError} | tesseract fallback failed: ${fallbackMessage}`;
            }
          } else {
            ocrError = primaryError;
          }
        }
      }

      if (provider === "none") {
        const visualSummary = image.alt ? `Image alt text: ${image.alt}` : undefined;
        const status: ImageEnrichment["status"] = ocrText || visualSummary ? "ok" : "skipped";
        results.push({
          imageId: image.id,
          messageId: image.messageId,
          src: image.src,
          localPath: image.localPath,
          status,
          ocrText: ocrText || undefined,
          visualSummary,
          error: [ocrError, "no multimodal provider key; OCR-first mode only"]
            .filter(Boolean)
            .join(" | "),
        });
        continue;
      }

      try {
        const buffer = await readFile(image.localPath);
        const mimeType = guessMimeType(image.localPath);
        const contextText = turn.text;
        const prompt = buildImagePrompt(contextText, ocrText);
        const response = await callDoubaoVision({
          model: options.model,
          apiKey: doubaoApiKey ?? "",
          baseUrl: options.doubaoBaseUrl ?? process.env.DOUBAO_BASE_URL,
          prompt,
          imageBase64: buffer.toString("base64"),
          mimeType,
        });

        const parsed = parseImageJson(response.text);
        results.push({
          imageId: image.id,
          messageId: image.messageId,
          src: image.src,
          localPath: image.localPath,
          status: "ok",
          ocrText: parsed.ocr_text || ocrText,
          visualSummary: parsed.visual_summary,
          relevanceToConversation: parsed.relevance_to_context,
          rawResponse: response.text,
          error: ocrError || undefined,
        });
      } catch (error) {
        results.push({
          imageId: image.id,
          messageId: image.messageId,
          src: image.src,
          localPath: image.localPath,
          status: "error",
          ocrText: ocrText || undefined,
          error: [error instanceof Error ? error.message : String(error), ocrError]
            .filter(Boolean)
            .join(" | "),
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
