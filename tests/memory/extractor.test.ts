import { describe, expect, test, vi } from "vitest";
import { extractEvents, extractPersona } from "../../src/lib/memory/extractor.js";
import type { SessionTurn } from "../../src/types.js";

vi.mock("../../src/lib/doubao.js", () => ({
  callDoubaoChat: vi.fn(() => Promise.resolve({
    content: [{
      type: "text",
      text: JSON.stringify([
        {
          id: "evt-001",
          date: "2026-03-18",
          category: "emotional",
          title: "用户决定保持边界",
          summary: "用户面对旧关系触发点，选择保持静默和边界",
          evidenceTurnIds: ["t-001"],
          tags: ["边界", "情感"]
        }
      ])
    }],
    raw: {}
  }))
}));

describe("memory extractor", () => {
  test("extractEvents should generate timeline events from turns", async () => {
    const turns: SessionTurn[] = [
      {
        id: "t-001",
        order: 1,
        role: "user",
        text: "我现在被旧关系动态触发了，但我决定不回消息",
        sourceUrl: "test",
        images: []
      }
    ];

    const events = await extractEvents(turns);
    expect(events.length).toBe(1);
    expect(events[0].category).toBe("emotional");
    expect(events[0].title).toContain("边界");
  });
});
