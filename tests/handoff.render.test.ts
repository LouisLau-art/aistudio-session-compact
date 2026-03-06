import { describe, expect, it } from "vitest";

import { renderHandoffMarkdown, renderResumePrompt } from "../src/lib/render.js";
import type { ContextCapsule } from "../src/types.js";

const fixture: ContextCapsule = {
  meta: {
    createdAt: "2026-03-05T00:00:00.000Z",
    rawPath: "raw.ndjson",
    turnCount: 10,
    imageCount: 2,
    chunkCount: 3,
    modelUsed: "heuristic-local",
    mode: "heuristic",
  },
  sessionSummary: "Main summary",
  goals: ["Goal A"],
  decisions: [{ decision: "Decision A", evidenceTurnIds: ["t-1"] }],
  constraints: ["Constraint A"],
  openQuestions: ["Question A"],
  todos: ["Todo A"],
  keyFacts: [{ fact: "Fact A", evidenceTurnIds: ["t-1"] }],
  timeline: [{ turnId: "t-1", role: "user", summary: "s" }],
  resumeBrief: "Resume here",
};

describe("render output", () => {
  it("renders handoff sections", () => {
    const text = renderHandoffMarkdown(fixture);
    expect(text).toContain("# Session Handoff");
    expect(text).toContain("## Locked Decisions");
    expect(text).toContain("Decision A");
  });

  it("renders resume prompt as compact markdown context", () => {
    const text = renderResumePrompt(fixture);
    expect(text).toContain("## Session Summary");
    expect(text).toContain("## Goals");
    expect(text).not.toContain("Context capsule JSON");
    expect(text).not.toContain("```json");
  });
});
