import type { SessionTurn, TurnRole } from "../types.js";

export interface BrowserExtractedTurn {
  text: string;
  roleHint?: string;
  images: Array<{ src: string; alt?: string }>;
  domPath?: string;
}

const UI_NOISE_PATTERNS: RegExp[] = [
  /\bmore_vert\b/gi,
  /\bedit\b/gi,
  /\bthumb_up\b/gi,
  /\bthumb_down\b/gi,
  /\bchevron_(?:left|right)\b/gi,
  /\bcompare_arrows\b/gi,
  /\bkeyboard_return\b/gi,
  /\badd_circle\b/gi,
  /\bkey_off\b/gi,
  /\bwidgets\b/gi,
  /\btune\b/gi,
  /\bmenu\b/gi,
];

function normalizeSpace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function cleanUiArtifacts(input: string): string {
  let text = input;

  for (const pattern of UI_NOISE_PATTERNS) {
    text = text.replace(pattern, " ");
  }

  text = text
    .replace(/Google AI models may make mistakes[\s\S]*?return to the chat\./gi, " ")
    .replace(/Use Arrow Up and Arrow Down[\s\S]*?return to the chat\./gi, " ")
    .replace(/Expand to view model thoughts/gi, " ");

  return normalizeSpace(text);
}

function splitCompositeTurn(row: BrowserExtractedTurn): BrowserExtractedTurn[] {
  const text = cleanUiArtifacts(row.text);
  if (!text) {
    return [];
  }

  const markerRegex = /\b(User|Model)\b(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/gi;
  const markers: Array<{ role: "user" | "model"; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = markerRegex.exec(text)) !== null) {
    const role = match[1]?.toLowerCase() === "user" ? "user" : "model";
    markers.push({ role, index: match.index });
  }

  if (markers.length < 2) {
    return [{ ...row, text }];
  }

  const parts: BrowserExtractedTurn[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const start = current.index;
    const end = next ? next.index : text.length;
    const segment = normalizeSpace(text.slice(start, end));
    if (!segment) continue;

    parts.push({
      text: segment,
      roleHint: current.role,
      images: i === 0 ? row.images : [],
      domPath: row.domPath,
    });
  }

  return parts.length ? parts : [{ ...row, text }];
}

function isUiOnlyNoise(text: string): boolean {
  if (!text) return true;

  const normalized = normalizeSpace(text.toLowerCase());
  if (!normalized) return true;

  if (normalized.length < 16) {
    return true;
  }

  const meaningfulWords = normalized
    .split(/\s+/)
    .filter((token) => token.length > 1 && !/^(user|model|pm|am)$/.test(token));
  return meaningfulWords.length < 2;
}

export function inferRole(roleHint: string | undefined, text: string): TurnRole {
  const hint = (roleHint ?? "").toLowerCase();
  const prefix = normalizeSpace(text).slice(0, 80).toLowerCase();

  if (/\b(user|you|prompt|human|我|用户)\b/.test(hint)) {
    return "user";
  }
  if (/\b(gemini|assistant|model|ai|回复|回答)\b/.test(hint)) {
    return "model";
  }
  if (/\b(system|instruction|meta)\b/.test(hint)) {
    return "system";
  }

  if (/^(you|user|我|用户)[:：]/.test(prefix)) {
    return "user";
  }
  if (/^(gemini|assistant|model|ai)[:：]/.test(prefix)) {
    return "model";
  }

  return "unknown";
}

export function normalizeBrowserTurns(
  rows: BrowserExtractedTurn[],
  sourceUrl: string,
): SessionTurn[] {
  const turns: SessionTurn[] = [];
  const expandedRows = rows.flatMap(splitCompositeTurn);

  for (const [idx, row] of expandedRows.entries()) {
    const text = cleanUiArtifacts(row.text);
    if (!text || isUiOnlyNoise(text)) {
      continue;
    }

    const id = `t-${String(turns.length + 1).padStart(6, "0")}`;
    const role = inferRole(row.roleHint, text);

    const images = row.images.map((img, imageIdx) => ({
      id: `${id}-img-${String(imageIdx + 1).padStart(3, "0")}`,
      messageId: id,
      src: img.src,
      alt: img.alt,
      index: imageIdx,
    }));

    turns.push({
      id,
      order: idx,
      role,
      text,
      sourceUrl,
      roleHint: row.roleHint,
      images,
    });
  }

  return turns;
}

export function fallbackTextTurn(text: string, sourceUrl: string): SessionTurn[] {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return [];
  }

  return [
    {
      id: "t-000001",
      order: 0,
      role: "unknown",
      text: normalized,
      sourceUrl,
      images: [],
    },
  ];
}
