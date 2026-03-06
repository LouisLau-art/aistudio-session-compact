import type { SessionTurn, TurnRole } from "../types.js";

export interface BrowserExtractedTurn {
  text: string;
  roleHint?: string;
  images: Array<{ src: string; alt?: string }>;
  domPath?: string;
}

const UI_NOISE_PATTERNS: RegExp[] = [
  /menu_open/gi,
  /more_vert/gi,
  /content_copy/gi,
  /expand_less/gi,
  /expand_more/gi,
  /\bedit\b/gi,
  /thumb_up/gi,
  /thumb_down/gi,
  /chevron_(?:left|right)/gi,
  /compare_arrows/gi,
  /keyboard_return/gi,
  /add_circle/gi,
  /key_off/gi,
  /widgets/gi,
  /\btune\b/gi,
  /\bmenu\b/gi,
];

const NOISE_KEYWORDS = [
  "more_vert",
  "model thoughts",
  "user docs",
  "expand to view",
  "thumb_up",
  "thumb_down",
  "google ai models may make mistakes",
  "skip to main content",
  "toggle navigation",
  "open options",
  "expand_morehome",
  "run ctrl",
  "drop files here",
  "tools",
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
    .replace(/\bcode\s+codedownload(?:content_copy)?(?:expand_(?:less|more))?\b/gi, " ")
    .replace(/\bcodedownload(?:content_copy)?(?:expand_(?:less|more))?\b/gi, " ")
    .replace(/\bcode\s+codedownloadcontent_copy(?:expand_(?:less|more))?\b/gi, " ")
    .replace(/codedownloadcontent_copy(?:expand_(?:less|more))?/gi, " ")
    .replace(/\bcontent_copy(?:expand_(?:less|more))?\b/gi, " ")
    .replace(/\bexpand_(?:less|more)\b/gi, " ")
    .replace(/(?:^|\s)User docs[\s\S]{0,180}?\b\d[\d,]*\s*tokens?\b/gi, " ")
    .replace(/(?:^|\s)docs[\s\S]{0,180}?\b\d[\d,]*\s*tokens?\b/gi, " ")
    .replace(/\bModel Thoughts\b[\s\S]*$/gi, " ")
    .replace(/Google AI models may make mistakes[\s\S]*?return to the chat\./gi, " ")
    .replace(/Use Arrow Up and Arrow Down[\s\S]*?return to the chat\./gi, " ")
    .replace(/Expand to view model thoughts/gi, " ")
    .replace(/\bExpand to view\b/gi, " ")
    .replace(/sharecompare_arrowsaddmore_vertmore_vert/gi, " ");

  return normalizeSpace(text);
}

function isModelThoughtTrace(text: string): boolean {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return false;
  }

  const cueMatches =
    normalized.match(
      /\b(analyzing|assessing|formulating|refining|drafting|deconstructing|reframing|considering|focusing)\b/gi,
    )?.length ?? 0;

  if (/^model(?:\s+\d{1,2}:\d{2}\s*(?:am|pm)?)?\s+thoughts\b/i.test(normalized)) {
    return true;
  }
  if (/^user\s+input\b/i.test(normalized) && (cueMatches > 0 || /\bi'?m\s+now\b/i.test(normalized))) {
    return true;
  }

  const hasExpandFooter = /\bexpand to view\b/i.test(normalized);
  const hasThoughtKeyword = /\bthoughts\b/i.test(normalized);
  const hasChainCue =
    /\b(i'?m currently|i'?m now|analyzing|assessing|drafting|formulating|refining|deconstructing|reframing)\b/i.test(
      normalized,
    );
  if (hasExpandFooter && hasThoughtKeyword && hasChainCue) {
    return true;
  }
  return cueMatches >= 3 && /\bi'?m\s+now\b/i.test(normalized);
}

function splitCompositeTurn(row: BrowserExtractedTurn): BrowserExtractedTurn[] {
  const text = cleanUiArtifacts(row.text);
  if (!text) {
    return [];
  }
  if (row.domPath?.startsWith("ms-chat-turn#")) {
    return [{ ...row, text }];
  }

  const markerRegex = /(^|[\s])((?:User|Model))(?!['’])(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/g;
  const markers: Array<{ role: "user" | "model"; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = markerRegex.exec(text)) !== null) {
    const role = match[2]?.toLowerCase() === "user" ? "user" : "model";
    const start = match.index + (match[1]?.length ?? 0);
    markers.push({ role, index: start });
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
  if (meaningfulWords.length < 2) {
    return true;
  }

  if (/^model thoughts\b/i.test(normalized)) {
    return true;
  }
  if (isModelThoughtTrace(text)) {
    return true;
  }
  if (/^user docs\b/i.test(normalized) && /\btokens?\b/i.test(normalized)) {
    return true;
  }

  return false;
}

function isLikelyNoisyTurn(text: string): boolean {
  const normalized = normalizeSpace(text.toLowerCase());
  if (!normalized) return true;
  return NOISE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function isLikelyUiImage(image: { src: string; alt?: string }): boolean {
  const src = image.src.toLowerCase();
  const alt = (image.alt ?? "").toLowerCase();
  return (
    src.includes("gstatic.com/aistudio/watermark/watermark.png") ||
    src.includes("/images/branding/productlogos/") ||
    alt.includes("thinking") ||
    alt.includes("watermark")
  );
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

    const images = row.images
      .filter((img) => !isLikelyUiImage(img))
      .map((img, imageIdx) => ({
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

export interface CaptureQuality {
  turnCount: number;
  unknownRoleCount: number;
  unknownRoleRatio: number;
  noiseCount: number;
  noiseRatio: number;
}

export function assessCaptureQuality(turns: SessionTurn[]): CaptureQuality {
  const turnCount = turns.length;
  if (!turnCount) {
    return {
      turnCount: 0,
      unknownRoleCount: 0,
      unknownRoleRatio: 0,
      noiseCount: 0,
      noiseRatio: 0,
    };
  }

  const unknownRoleCount = turns.filter((turn) => turn.role === "unknown").length;
  const noiseCount = turns.filter((turn) => isLikelyNoisyTurn(turn.text)).length;

  return {
    turnCount,
    unknownRoleCount,
    unknownRoleRatio: unknownRoleCount / turnCount,
    noiseCount,
    noiseRatio: noiseCount / turnCount,
  };
}

export function assertCaptureQuality(turns: SessionTurn[], strictCapture = true): void {
  if (!strictCapture) {
    return;
  }

  const quality = assessCaptureQuality(turns);
  if (quality.turnCount === 0) {
    throw new Error(
      "Capture quality gate failed: no usable turns extracted. Use --no-strict-capture for raw debug output.",
    );
  }

  const failedByTurnCount = quality.turnCount < 6;
  const failedByNoise = quality.turnCount >= 10 && quality.noiseRatio > 0.22;
  const failedByUnknownRole = quality.turnCount >= 10 && quality.unknownRoleRatio > 0.45;

  if (failedByTurnCount || failedByNoise || failedByUnknownRole) {
    throw new Error(
      `Capture quality gate failed: turns=${quality.turnCount}, noiseRatio=${quality.noiseRatio.toFixed(
        2,
      )}, unknownRoleRatio=${quality.unknownRoleRatio.toFixed(
        2,
      )}. Use --no-strict-capture for raw debug output.`,
    );
  }
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
