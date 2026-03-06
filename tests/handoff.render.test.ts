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
  background: {
    summary: "The user is trying to carry forward a painful relationship-analysis conversation into a new session.",
    emotionalContext: ["The user is emotionally overloaded and wants continuity instead of restarting from zero."],
    workingFrames: ["Lacan", "Zizek"],
  },
  peopleMap: [
    {
      name: "何引",
      relation: "Central person in the story",
      notes: "The user currently frames her through a narcissism lens.",
    },
    {
      name: "小雅",
      relation: "Peripheral but emotionally relevant figure",
    },
  ],
  currentState: {
    summary: "Current relationship state",
    currentObjectives: ["Clarify whether to disengage"],
    currentStance: ["Avoid overexplaining"],
    nextTopics: ["Should the user fully disengage now?"],
  },
  goals: ["Goal A"],
  decisions: [{ decision: "Decision A", evidenceTurnIds: ["t-1"] }],
  stableDecisions: [{ decision: "Do not overexplain", evidenceTurnIds: ["t-1"] }],
  constraints: ["Constraint A"],
  openQuestions: ["Question A"],
  todos: ["Todo A"],
  keyFacts: [{ fact: "Fact A", evidenceTurnIds: ["t-1"] }],
  timeline: [{ turnId: "t-1", role: "user", summary: "s" }],
  recentTimeline: [{ turnId: "t-9", role: "model", summary: "recent checkpoint" }],
  appendix: {
    archivedGoals: ["Old goal"],
    archivedQuestions: ["Old question"],
    archivedFacts: ["Old fact"],
  },
  resumeBrief: "Resume here",
};

describe("render output", () => {
  it("renders handoff sections in the expected order", () => {
    const text = renderHandoffMarkdown(fixture);

    expect(text).toContain("# Session Handoff");
    expect(text).toContain("## Background");
    expect(text).toContain("## People Map");
    expect(text).toContain("## Current State");
    expect(text).toContain("## Stable Decisions");
    expect(text).toContain("## Active Facts");
    expect(text).toContain("## Appendix");
    expect(text).toContain("何引");
    expect(text).toContain("Fact A");

    expect(text.indexOf("## Background")).toBeLessThan(text.indexOf("## People Map"));
    expect(text.indexOf("## People Map")).toBeLessThan(text.indexOf("## Current State"));
    expect(text.indexOf("## Current State")).toBeLessThan(text.indexOf("## Stable Decisions"));
    expect(text.indexOf("## Stable Decisions")).toBeLessThan(text.indexOf("## Active Facts"));
  });

  it("renders resume prompt as compact markdown context", () => {
    const text = renderResumePrompt(fixture);
    expect(text).toContain("## Background");
    expect(text).toContain("## People Map");
    expect(text).toContain("## Current State");
    expect(text).toContain("## Stable Decisions");
    expect(text).toContain("## Active Facts");
    expect(text).toContain("## Recent Timeline");
    expect(text).toContain("## Appendix");
    expect(text).not.toContain("Context capsule JSON");
    expect(text).not.toContain("```json");
  });
});
