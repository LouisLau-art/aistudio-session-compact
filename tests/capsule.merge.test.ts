import { describe, expect, it } from "vitest";

import { buildContextCapsule } from "../src/lib/capsule.js";
import type { ChunkSummary, SessionTurn } from "../src/types.js";

describe("buildContextCapsule", () => {
  it("deduplicates key arrays", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "user",
        text: "We need a stable pipeline and must keep decision traceability.",
        sourceUrl: "https://example.com",
        images: [],
      },
    ];

    const summary: ChunkSummary = {
      summary: "summary",
      goals: ["Stable pipeline", "stable pipeline"],
      decisions: ["Use CDP", "use cdp"],
      constraints: ["Must be resumable", "must be resumable"],
      openQuestions: ["How to handle images?"],
      todos: ["Implement capture"],
      keyFacts: ["Session is huge"],
    };

    const capsule = buildContextCapsule({
      rawPath: "raw.ndjson",
      turns,
      chunkSummaries: [{ turnIds: ["t-000001"], summary }],
      modelUsed: "x",
      mode: "heuristic",
    });

    expect(capsule.goals).toEqual(["Stable pipeline"]);
    expect(capsule.decisions).toHaveLength(1);
    expect(capsule.constraints).toEqual(["Must be resumable"]);
  });
});
