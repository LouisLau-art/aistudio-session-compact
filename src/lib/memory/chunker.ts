import type { SessionTurn } from "../../types.js";
import type { Chunk } from "./types.js";
import { extractDateFromTurn } from "./normalizer.js";

const MAX_CHUNK_SIZE = 2000; // 每个 chunk 最大字符数
const CHUNK_OVERLAP = 200;  // 重叠字符数

/**
 * 把对话按语义分块
 */
export function chunkConversation(
  turns: SessionTurn[],
  sessionId: string
): Chunk[] {
  const chunks: Chunk[] = [];
  let currentChunk: string[] = [];
  let currentTurnIds: string[] = [];
  let currentSize = 0;
  let chunkIndex = 0;

  for (const turn of turns) {
    const turnText = `${turn.role}: ${turn.text}\n`;
    const turnSize = turnText.length;

    // 如果当前 chunk 加上这个 turn 超过限制，就保存当前 chunk
    if (currentSize + turnSize > MAX_CHUNK_SIZE && currentSize > 0) {
      chunks.push({
        id: `${sessionId}-chunk-${chunkIndex++}`,
        sourceSessionId: sessionId,
        sourceTurnIds: [...currentTurnIds],
        content: currentChunk.join(""),
        topic: "", // TODO: 后续用 LLM 生成主题
        metadata: {
          date: extractDateFromTurns(currentTurnIds, turns) || "",
          hasImages: currentTurnIds.some(id => turnHasImages(id, turns)),
          emotionalIntensity: "medium" // TODO: 后续实现情感强度识别
        }
      });

      // 保留重叠部分（最后 10% 的内容）
      const overlapLines = Math.max(1, Math.floor(currentChunk.length * 0.1));
      const overlap = currentChunk.slice(-overlapLines);
      const overlapTurnIds = currentTurnIds.slice(-overlapLines);

      currentChunk = overlap;
      currentTurnIds = overlapTurnIds;
      currentSize = overlap.join("").length;
    }

    currentChunk.push(turnText);
    currentTurnIds.push(turn.id);
    currentSize += turnSize;
  }

  // 保存最后一个 chunk
  if (currentChunk.length > 0) {
    chunks.push({
      id: `${sessionId}-chunk-${chunkIndex}`,
      sourceSessionId: sessionId,
      sourceTurnIds: currentTurnIds,
      content: currentChunk.join(""),
      topic: "",
      metadata: {
        date: extractDateFromTurns(currentTurnIds, turns) || "",
        hasImages: currentTurnIds.some(id => turnHasImages(id, turns)),
        emotionalIntensity: "medium"
      }
    });
  }

  return chunks;
}

function extractDateFromTurns(turnIds: string[], allTurns: SessionTurn[]): string | null {
  for (const id of turnIds) {
    const turn = allTurns.find(t => t.id === id);
    if (turn) {
      const date = extractDateFromTurn(turn);
      if (date) return date;
    }
  }
  return null;
}

function turnHasImages(turnId: string, allTurns: SessionTurn[]): boolean {
  return (allTurns.find(t => t.id === turnId)?.images.length ?? 0) > 0;
}
