import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runHandoff } from "../src/commands/handoff.js";
import type { SessionTurn, StateSnapshot } from "../src/types.js";

describe("runHandoff v2", () => {
  it("renders resume and handoff markdown from snapshot plus preserved tail", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "handoff-v2-"));
    const snapshotPath = path.join(outDir, "state_snapshot.json");
    const tailPath = path.join(outDir, "preserved_tail.ndjson");

    const snapshot: StateSnapshot = {
      version: 2,
      meta: {
        createdAt: "2026-03-09T00:00:00.000Z",
        rawPath: "/tmp/session.raw.ndjson",
        turnCount: 6,
        imageCount: 0,
        chunkCount: 1,
        mode: "heuristic",
        modelUsed: "heuristic-local",
        strategy: "briefing-plus-state-plus-tail",
      },
      briefing: {
        applied: true,
        sourcePath: "/tmp/story_briefing.json",
      },
      background: {
        summary: "The user is trying to continue a long-running relationship analysis without restarting the story.",
        emotionalContext: ["Pain", "confusion"],
        workingFrames: ["NPD", "Lacan"],
      },
      peopleMap: [
        {
          name: "何引",
          relation: "Central person in the story",
          notes: "The user frames her through a narcissism lens.",
        },
      ],
      stableFacts: ["The user met 何引 on 2026-01-14."],
      timelineAnchors: ["2026-01-14: first meeting"],
      currentState: {
        summary: "The user currently wants to reduce contact and decide whether to disengage completely.",
        currentObjectives: ["Reduce contact and continue recovery."],
        currentStance: ["Do not overexplain."],
        activeQuestions: ["Should I stop replying altogether?"],
        nextActions: ["Draft one short boundary-setting reply."],
      },
      stableDecisions: [{ decision: "Do not overexplain.", evidenceTurnIds: ["t-000004"] }],
      activeFacts: [{ fact: "The user already confessed and was rejected.", evidenceTurnIds: ["t-000001"] }],
      recentTimeline: [{ turnId: "t-000005", role: "user", summary: "Asked whether to stop replying altogether." }],
      archive: {
        archivedGoals: ["Reconstruct the whole January story."],
        archivedQuestions: ["What exactly happened in January?"],
        archivedFacts: ["The user already had intimate physical contact before the rejection."],
      },
    };

    const tail: SessionTurn[] = [
      {
        id: "t-000005",
        order: 5,
        role: "user",
        text: "Current question: should I stop replying altogether?",
        sourceUrl: "https://aistudio.google.com/prompts/example",
        images: [],
      },
      {
        id: "t-000006",
        order: 6,
        role: "model",
        text: "Current stance: reduce contact and keep a strict boundary.",
        sourceUrl: "https://aistudio.google.com/prompts/example",
        images: [],
      },
    ];

    await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
    await writeFile(tailPath, tail.map((turn) => JSON.stringify(turn)).join("\n") + "\n", "utf8");

    const result = await runHandoff({
      snapshotPath,
      tailPath,
      outDir,
    });

    const resumePrompt = await readFile(result.resumePromptPath, "utf8");
    const handoff = await readFile(result.handoffPath, "utf8");
    const preservedTailMd = await readFile(result.preservedTailMarkdownPath, "utf8");
    const preservedTailTxt = await readFile(result.preservedTailTextPath, "utf8");

    expect(resumePrompt).toContain("## Current State");
    expect(resumePrompt).toContain("Reduce contact and continue recovery.");
    expect(resumePrompt).toContain("## Stable Background");
    expect(resumePrompt).toContain("The user met 何引 on 2026-01-14.");
    expect(resumePrompt).toContain("## Preserved Recent Turns");
    expect(resumePrompt).toContain("[5] USER t-000005");
    expect(resumePrompt).toContain("[6] MODEL t-000006");
    expect(resumePrompt).toContain("## Archived Context");

    expect(handoff).toContain("# Session Handoff");
    expect(handoff).toContain("## Current State");
    expect(handoff).toContain("## Stable Background");
    expect(handoff).toContain("## People Map");
    expect(handoff).toContain("## Preserved Recent Turns");

    expect(preservedTailMd).toContain("# Preserved Recent Turns");
    expect(preservedTailMd).toContain("[5] USER t-000005");
    expect(preservedTailMd).toContain("[6] MODEL t-000006");

    expect(preservedTailTxt).toContain("[5] USER t-000005");
    expect(preservedTailTxt).toContain("Current question: should I stop replying altogether?");
    expect(preservedTailTxt).toContain("[6] MODEL t-000006");

    expect(resumePrompt.indexOf("## Current State")).toBeLessThan(resumePrompt.indexOf("## Archived Context"));
  });
});
