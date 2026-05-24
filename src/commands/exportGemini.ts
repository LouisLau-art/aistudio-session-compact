import path from "node:path";

import { runTranscript } from "./transcript.js";
import { evaluateInCdpTarget, fetchCdpTargets, selectCdpPageTarget } from "../lib/cdp.js";
import { writeJson, writeNdjson } from "../lib/fs.js";
import type { SessionTurn, TurnRole } from "../types.js";

export interface GeminiExtractedTurn {
  role: TurnRole;
  text: string;
  roleHint?: string;
}

export interface ExportGeminiOptions {
  outDir: string;
  cdpUrl: string;
  urlMatch: string;
  conversationUrl?: string;
  conversationId?: string;
  tabIndex?: number;
}

export interface ExportGeminiResult {
  rawPath: string;
  transcriptTxtPath: string;
  transcriptMdPath: string;
  transcriptReportPath: string;
  reportPath: string;
  conversationId: string;
  sourceUrl: string;
  turnCount: number;
}

interface ExportGeminiDeps {
  fetchTurns: (options: ExportGeminiOptions) => Promise<GeminiExtractedTurn[]>;
  runTranscript: typeof runTranscript;
}

const defaultDeps: ExportGeminiDeps = {
  fetchTurns: fetchGeminiTurnsFromCdp,
  runTranscript,
};

export async function runExportGemini(
  options: ExportGeminiOptions,
  deps: ExportGeminiDeps = defaultDeps,
): Promise<ExportGeminiResult> {
  const conversationId = options.conversationId ?? extractGeminiConversationId(options.conversationUrl ?? "");
  if (!conversationId) {
    throw new Error("Missing Gemini conversation id. Pass --conversation-url or --conversation-id.");
  }

  const sourceUrl = options.conversationUrl ?? `https://gemini.google.com/app/${conversationId}`;
  const rawPath = path.join(options.outDir, "session.raw.ndjson");
  const reportPath = path.join(options.outDir, "export-gemini.report.json");

  const extractedTurns = await deps.fetchTurns({ ...options, conversationId, conversationUrl: sourceUrl });
  const turns = normalizeGeminiTurns(extractedTurns, sourceUrl);
  if (!turns.length) {
    throw new Error("No Gemini conversation turns found. Make sure the Gemini tab is loaded and the conversation turns are visible.");
  }
  await writeNdjson(rawPath, turns);

  const transcript = await deps.runTranscript({
    rawPath,
    outDir: options.outDir,
  });

  await writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    provider: "gemini",
    conversationId,
    sourceUrl,
    rawPath,
    transcriptTxtPath: transcript.transcriptTxtPath,
    transcriptMdPath: transcript.transcriptMdPath,
    transcriptReportPath: transcript.reportPath,
    turnCount: turns.length,
  });

  return {
    rawPath,
    transcriptTxtPath: transcript.transcriptTxtPath,
    transcriptMdPath: transcript.transcriptMdPath,
    transcriptReportPath: transcript.reportPath,
    reportPath,
    conversationId,
    sourceUrl,
    turnCount: turns.length,
  };
}

export function extractGeminiConversationId(input: string): string {
  if (!input) return "";
  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/app\/([^/?#]+)/);
    return match?.[1] ?? "";
  } catch {
    const match = input.match(/(?:^|\/app\/)([^/?#\s]+)/);
    return match?.[1] ?? input.trim();
  }
}

export function normalizeGeminiTurns(extractedTurns: GeminiExtractedTurn[], sourceUrl: string): SessionTurn[] {
  return extractedTurns
    .map((turn) => ({
      ...turn,
      text: turn.text.trim(),
    }))
    .filter((turn) => turn.text)
    .map((turn, index) => ({
      id: `t-${String(index + 1).padStart(6, "0")}`,
      order: index,
      role: turn.role,
      text: turn.text,
      sourceUrl,
      roleHint: turn.roleHint,
      images: [],
    }));
}

async function fetchGeminiTurnsFromCdp(options: ExportGeminiOptions): Promise<GeminiExtractedTurn[]> {
  const targets = await fetchCdpTargets(options.cdpUrl);
  const target = selectCdpPageTarget(targets, options.urlMatch, options.tabIndex);
  if (!target) {
    const pageCount = targets.filter((candidate) => candidate.type === "page").length;
    throw new Error(`No page URL matched "${options.urlMatch}". Open the target Gemini conversation tab first. Found ${pageCount} page tabs.`);
  }

  const value = await evaluateInCdpTarget<unknown>(target, buildGeminiTurnsEvalExpression());
  if (typeof value !== "string") {
    throw new Error(`Gemini CDP evaluation returned ${typeof value}, expected JSON string`);
  }
  return JSON.parse(value) as GeminiExtractedTurn[];
}

export function buildGeminiTurnsEvalExpression(): string {
  return String.raw`(() => {
    function extractGeminiTurns() {
    if (!location.origin.includes("gemini.google.com")) {
      throw new Error("Target page is not a Gemini page: " + location.href);
    }

    const raw = [];

    const selectors = {
      user: [
        "user-query",
        ".query-text",
        "[data-test-id='user-query']",
        "[data-testid='user-query']",
        "[aria-label^='You said']",
      ],
      model: [
        "model-response",
        "message-content",
        ".model-response-text",
        ".response-content",
        "[data-test-id='model-response']",
        "[data-testid='model-response']",
      ],
    };

    const getText = (element) => (element.textContent || "").replace(/\s+/g, " ").trim();
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const push = (role, element, selector) => {
      if (!element || !isVisible(element)) return;
      const text = getText(element);
      if (!text) return;
      const rect = element.getBoundingClientRect();
      raw.push({
        role,
        text,
        selector,
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
      });
    };

    document.querySelectorAll("share-turn-viewer").forEach((turn) => {
      push("user", turn.querySelector(".query-text, user-query"), "share-turn-viewer user");
      push("model", turn.querySelector("message-content, model-response"), "share-turn-viewer model");
    });

    for (const selector of selectors.user) {
      document.querySelectorAll(selector).forEach((element) => push("user", element, selector));
    }
    for (const selector of selectors.model) {
      document.querySelectorAll(selector).forEach((element) => push("model", element, selector));
    }

    raw.sort((a, b) => a.top - b.top || a.left - b.left);

    const deduped = [];
    for (const candidate of raw) {
      const existingIndex = deduped.findIndex(
        (item) =>
          item.role === candidate.role &&
          (item.text === candidate.text || item.text.includes(candidate.text) || candidate.text.includes(item.text)),
      );
      if (existingIndex === -1) {
        deduped.push(candidate);
      } else if (candidate.text.length > deduped[existingIndex].text.length) {
        deduped[existingIndex] = candidate;
      }
    }

    return JSON.stringify(
      deduped.map((turn) => ({
        role: turn.role,
        text: turn.text,
        roleHint: "gemini selector=" + turn.selector,
      })),
    );
    }
    return extractGeminiTurns();
  })()`;
}
