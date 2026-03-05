import type { SessionTurn, TurnRole } from "../types.js";

export interface BrowserExtractedTurn {
  text: string;
  roleHint?: string;
  images: Array<{ src: string; alt?: string }>;
  domPath?: string;
}

function normalizeSpace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
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

  for (const [idx, row] of rows.entries()) {
    const text = normalizeSpace(row.text);
    if (!text) {
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
