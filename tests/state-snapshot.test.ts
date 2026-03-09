import { describe, expect, it } from "vitest";

import { buildStateSnapshot } from "../src/lib/state-snapshot.js";
import type { SessionTurn } from "../src/types.js";

function makeTurn(order: number, role: SessionTurn["role"], text: string): SessionTurn {
  return {
    id: `t-${String(order).padStart(6, "0")}`,
    order,
    role,
    text,
    sourceUrl: "https://aistudio.google.com/prompts/example",
    images: [],
  };
}

describe("buildStateSnapshot", () => {
  it("merges briefing data and prefers recent state over archived history", () => {
    const turns: SessionTurn[] = [
      makeTurn(1, "user", "Goal: reconstruct the whole January story in exhaustive detail."),
      makeTurn(2, "model", "Question: what exactly happened in January?"),
      makeTurn(3, "user", "Current objective: reduce contact and continue recovery."),
      makeTurn(4, "model", "Current stance: stop overexplaining and protect boundaries."),
      makeTurn(5, "user", "Current question: should I stop replying altogether?"),
      makeTurn(6, "user", "Next action: draft one short final boundary-setting reply."),
    ];

    const snapshot = buildStateSnapshot({
      rawPath: "/tmp/session.raw.ndjson",
      turns,
      preservedTail: turns.slice(-3),
      modelUsed: "heuristic-local",
      mode: "heuristic",
      briefing: {
        background: {
          summary: "The user is trying to continue a long-running relationship analysis without resetting the story.",
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
      },
    });

    expect(snapshot.version).toBe(2);
    expect(snapshot.background.summary).toContain("long-running relationship analysis");
    expect(snapshot.background.workingFrames).toEqual(expect.arrayContaining(["NPD", "Lacan"]));
    expect(snapshot.peopleMap.map((person) => person.name)).toContain("何引");
    expect(snapshot.stableFacts).toContain("The user met 何引 on 2026-01-14.");
    expect(snapshot.timelineAnchors).toContain("2026-01-14: first meeting");

    expect(snapshot.currentState.currentObjectives).toContain("reduce contact and continue recovery.");
    expect(snapshot.currentState.currentStance).toContain("stop overexplaining and protect boundaries.");
    expect(snapshot.currentState.activeQuestions).toContain("should I stop replying altogether?");
    expect(snapshot.currentState.nextActions).toContain("draft one short final boundary-setting reply.");

    expect(snapshot.archive.archivedGoals).toContain("reconstruct the whole January story in exhaustive detail.");
    expect(snapshot.archive.archivedQuestions).toContain("what exactly happened in January?");
    expect(snapshot.currentState.currentObjectives).not.toContain("reconstruct the whole January story in exhaustive detail.");
  });

  it("still produces a snapshot when image enrichment is missing", () => {
    const turns: SessionTurn[] = [
      {
        ...makeTurn(1, "user", "Current objective: preserve the text workflow even if image OCR is missing."),
        images: [{ id: "img-1", messageId: "t-000001", src: "local://img-1", index: 0 }],
      },
      makeTurn(2, "model", "Current stance: image failures should not block the fallback path."),
    ];

    const snapshot = buildStateSnapshot({
      rawPath: "/tmp/session.raw.ndjson",
      turns,
      preservedTail: turns,
      modelUsed: "heuristic-local",
      mode: "heuristic",
    });

    expect(snapshot.meta.turnCount).toBe(2);
    expect(snapshot.meta.imageCount).toBe(1);
    expect(snapshot.currentState.currentObjectives).toContain(
      "preserve the text workflow even if image OCR is missing.",
    );
    expect(snapshot.currentState.currentStance).toContain("image failures should not block the fallback path.");
  });

  it("prefers concise recent user questions over long narrative question dumps", () => {
    const longNarrativeQuestion =
      "我现在还是会反复想起何引，想到我们之前的肢体接触、表白被拒、博士哥、室友、球友、图书馆、围巾和各种细节，我到底是不是还可以继续和她接触、继续研究她、继续玩推拉、继续约她打球、继续保持若即若离的关系，哪怕只是为了社会学观察呢？";

    const turns: SessionTurn[] = [
      makeTurn(1, "user", longNarrativeQuestion),
      makeTurn(2, "model", "先不要在长叙事里迷路。"),
      makeTurn(3, "user", "现在更具体的问题是：我今晚要不要给小雅发消息？"),
      makeTurn(4, "model", "Current stance: prioritize the concrete next move over symbolic over-analysis."),
    ];

    const snapshot = buildStateSnapshot({
      rawPath: "/tmp/session.raw.ndjson",
      turns,
      preservedTail: turns,
      modelUsed: "heuristic-local",
      mode: "heuristic",
    });

    expect(snapshot.currentState.activeQuestions).toContain("现在更具体的问题是：我今晚要不要给小雅发消息？");
    expect(snapshot.currentState.activeQuestions).not.toContain(longNarrativeQuestion);
  });

  it("limits recent timeline to a concise view of the newest preserved turns", () => {
    const turns: SessionTurn[] = Array.from({ length: 20 }, (_, index) =>
      makeTurn(index + 1, index % 2 === 0 ? "user" : "model", `Turn ${index + 1}`),
    );

    const snapshot = buildStateSnapshot({
      rawPath: "/tmp/session.raw.ndjson",
      turns,
      preservedTail: turns,
      modelUsed: "heuristic-local",
      mode: "heuristic",
    });

    expect(snapshot.recentTimeline).toHaveLength(12);
    expect(snapshot.recentTimeline[0]?.turnId).toBe("t-000009");
    expect(snapshot.recentTimeline.at(-1)?.turnId).toBe("t-000020");
  });
});
