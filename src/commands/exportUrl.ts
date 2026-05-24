import path from "node:path";

import { runExportChatgpt } from "./exportChatgpt.js";
import { runExportGemini } from "./exportGemini.js";
import { runExportTranscript } from "./exportTranscript.js";
import type { ExportChatgptResult } from "./exportChatgpt.js";
import type { ExportGeminiResult } from "./exportGemini.js";
import type { ExportTranscriptResult } from "./exportTranscript.js";
import type { VisionProvider } from "./enrichImages.js";
import type { OcrEngine } from "../lib/ocr.js";

export type ExportUrlProvider = "aistudio" | "chatgpt" | "gemini";

export interface ExportRoute {
  provider: ExportUrlProvider;
  urlMatch: string;
}

export interface ExportUrlOptions {
  url: string;
  outDir?: string;
  cdpUrl: string;
  tabIndex?: number;
  provider: VisionProvider;
  ocrEngine: OcrEngine;
  enableOcr: boolean;
  ocrLang: string;
  model: string;
  pythonBin?: string;
  doubaoApiKey?: string;
  doubaoBaseUrl?: string;
  maxScrollIterations: number;
  stableRounds: number;
  scrollWaitMs: number;
  maxImageScreenshots: number;
  strictCapture?: boolean;
  withImages?: boolean;
}

export type ExportUrlResult =
  | ({ provider: "aistudio" } & ExportTranscriptResult)
  | ({ provider: "chatgpt" } & ExportChatgptResult)
  | ({ provider: "gemini" } & ExportGeminiResult);

interface ExportUrlDeps {
  runExportChatgpt: typeof runExportChatgpt;
  runExportGemini: typeof runExportGemini;
  runExportTranscript: typeof runExportTranscript;
}

const defaultDeps: ExportUrlDeps = {
  runExportChatgpt,
  runExportGemini,
  runExportTranscript,
};

export async function runExportUrl(
  options: ExportUrlOptions,
  deps: ExportUrlDeps = defaultDeps,
): Promise<ExportUrlResult> {
  const route = inferExportRoute(options.url);
  const outDir = path.resolve(options.outDir ?? defaultOutDir(options.url, route.provider));

  if (route.provider === "chatgpt") {
    return {
      provider: "chatgpt",
      ...(await deps.runExportChatgpt({
        outDir,
        cdpUrl: options.cdpUrl,
        urlMatch: route.urlMatch,
        conversationUrl: options.url,
        tabIndex: options.tabIndex,
      })),
    };
  }

  if (route.provider === "gemini") {
    return {
      provider: "gemini",
      ...(await deps.runExportGemini({
        outDir,
        cdpUrl: options.cdpUrl,
        urlMatch: route.urlMatch,
        conversationUrl: options.url,
        tabIndex: options.tabIndex,
      })),
    };
  }

  return {
    provider: "aistudio",
    ...(await deps.runExportTranscript({
      outDir,
      cdpUrl: options.cdpUrl,
      urlMatch: route.urlMatch,
      tabIndex: options.tabIndex,
      strictCapture: options.strictCapture,
      model: options.model,
      provider: options.provider,
      ocrEngine: options.ocrEngine,
      enableOcr: options.enableOcr,
      ocrLang: options.ocrLang,
      pythonBin: options.pythonBin,
      doubaoApiKey: options.doubaoApiKey,
      doubaoBaseUrl: options.doubaoBaseUrl,
      withImages: options.withImages,
      maxScrollIterations: options.maxScrollIterations,
      stableRounds: options.stableRounds,
      scrollWaitMs: options.scrollWaitMs,
      maxImageScreenshots: options.maxImageScreenshots,
    })),
  };
}

export function inferExportRoute(input: string): ExportRoute {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Unsupported URL: ${input}`);
  }

  if (url.hostname === "aistudio.google.com" && url.pathname.startsWith("/prompts/")) {
    return {
      provider: "aistudio",
      urlMatch: `${url.hostname}${url.pathname}`,
    };
  }

  if ((url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com") && url.pathname.startsWith("/c/")) {
    return {
      provider: "chatgpt",
      urlMatch: `${url.hostname}/c/`,
    };
  }

  if (url.hostname === "gemini.google.com" && url.pathname.startsWith("/app/")) {
    return {
      provider: "gemini",
      urlMatch: "gemini.google.com/app/",
    };
  }

  throw new Error(`Unsupported export URL: ${input}`);
}

function defaultOutDir(input: string, provider: ExportUrlProvider): string {
  const id = extractIdForPath(input) || "session";
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return path.join("out", `${provider}-${id}-${day}`);
}

function extractIdForPath(input: string): string {
  try {
    const url = new URL(input);
    return (url.pathname.split("/").filter(Boolean).at(-1) ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  } catch {
    return "";
  }
}
