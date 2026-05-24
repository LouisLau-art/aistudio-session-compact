import { describe, expect, test } from "vitest";
import { chunkConversation } from "../../src/lib/memory/chunker.js";
import type { SessionTurn } from "../../src/types.js";

describe("memory chunker", () => {
  test("chunkConversation should split long conversation into chunks", () => {
    const turns: SessionTurn[] = Array.from({ length: 20 }, (_, i) => ({
      id: `t-${String(i + 1).padStart(3, "0")}`,
      order: i + 1,
      role: i % 2 === 0 ? "user" : "model",
      text: `这是第 ${i + 1} 条对话内容，内容很长，用于测试分块功能。`.repeat(10),
      sourceUrl: "test",
      images: []
    }));

    const chunks = chunkConversation(turns, "test-session");
    expect(chunks.length).toBeGreaterThan(1);

    // 检查每个 chunk 的大小
    chunks.forEach(chunk => {
      expect(chunk.content.length).toBeLessThanOrEqual(2500); // 稍微留点余量
      expect(chunk.sourceTurnIds.length).toBeGreaterThan(0);
    });

    // 检查是否有重叠
    if (chunks.length >= 2) {
      const firstChunkLastTurn = chunks[0].sourceTurnIds[chunks[0].sourceTurnIds.length - 1];
      const secondChunkFirstTurn = chunks[1].sourceTurnIds[0];
      // 应该有重叠
      expect(Number(firstChunkLastTurn.replace("t-", ""))).toBeGreaterThanOrEqual(
        Number(secondChunkFirstTurn.replace("t-", "")) - 1
      );
    }
  });

  test("chunkConversation should handle single short conversation", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-001",
        order: 1,
        role: "user",
        text: "你好，这是一段短对话。",
        sourceUrl: "test",
        images: []
      }
    ];

    const chunks = chunkConversation(turns, "test-session");
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain("你好，这是一段短对话。");
  });
});
