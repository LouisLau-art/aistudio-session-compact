import type { SessionTurn } from "../types.js";

export function estimateChars(turn: SessionTurn): number {
  return turn.text.length + turn.images.length * 240;
}

export function chunkTurnsByChars(turns: SessionTurn[], maxChars: number): SessionTurn[][] {
  if (maxChars <= 0) {
    throw new Error("maxChars must be > 0");
  }

  const chunks: SessionTurn[][] = [];
  let current: SessionTurn[] = [];
  let size = 0;

  for (const turn of turns) {
    const turnSize = estimateChars(turn);
    if (current.length > 0 && size + turnSize > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }

    current.push(turn);
    size += turnSize;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}
