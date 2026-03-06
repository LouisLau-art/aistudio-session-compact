import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeContextCapsule } from "../src/lib/capsule-schema.js";
import { renderResumePrompt } from "../src/lib/render.js";

describe("normalizeContextCapsule", () => {
  it("uses legacy decisions as current stance when stableDecisions are absent", async () => {
    const raw = JSON.parse(
      await readFile(path.resolve("examples/sample.context_capsule.json"), "utf8"),
    ) as unknown;

    const capsule = normalizeContextCapsule(raw);

    expect(capsule.stableDecisions.map((item) => item.decision)).toContain("使用分层压缩");
    expect(capsule.currentState.currentStance).toContain("使用分层压缩");
  });

  it("preserves explicit empty stableDecisions instead of backfilling one-off decisions", () => {
    const capsule = normalizeContextCapsule({
      meta: {
        createdAt: "2026-03-06T00:00:00.000Z",
        rawPath: "raw.ndjson",
        turnCount: 1,
        imageCount: 0,
        chunkCount: 1,
        modelUsed: "heuristic-local",
        mode: "heuristic",
      },
      sessionSummary: "summary",
      goals: [],
      decisions: [{ decision: "One-off guidance", evidenceTurnIds: ["t-1"] }],
      stableDecisions: [],
      constraints: [],
      openQuestions: [],
      todos: [],
      keyFacts: [],
      timeline: [],
      recentTimeline: [],
      appendix: {
        archivedGoals: [],
        archivedQuestions: [],
        archivedFacts: [],
      },
      resumeBrief: "resume",
    });

    expect(capsule.stableDecisions).toEqual([]);

    const text = renderResumePrompt(capsule);
    expect(text).toContain("## Stable Decisions\n- (none)");
    expect(text).not.toContain("- One-off guidance");
  });
});
