import type { SessionTurn, StateSnapshot } from "../types.js";

export function renderHandoffMarkdown(snapshot: StateSnapshot, tail: SessionTurn[]): string {
  return [
    "# Session Handoff",
    "",
    `- Generated at: ${snapshot.meta.createdAt}`,
    `- Turns: ${snapshot.meta.turnCount}`,
    `- Images: ${snapshot.meta.imageCount}`,
    `- Strategy: ${snapshot.meta.strategy}`,
    "",
    "## Current State",
    snapshot.currentState.summary || "(empty)",
    "",
    "### Current Objectives",
    ...toBullets(snapshot.currentState.currentObjectives),
    "",
    "### Current Stance",
    ...toBullets(snapshot.currentState.currentStance),
    "",
    "### Active Questions",
    ...toBullets(snapshot.currentState.activeQuestions),
    "",
    "### Next Actions",
    ...toBullets(snapshot.currentState.nextActions),
    "",
    "## Stable Background",
    snapshot.background.summary || "(none)",
    "",
    "### Emotional Context",
    ...toBullets(snapshot.background.emotionalContext),
    "",
    "### Working Frames",
    ...toBullets(snapshot.background.workingFrames),
    "",
    "## People Map",
    ...toPeopleBullets(snapshot.peopleMap),
    "",
    "## Stable Facts",
    ...toBullets(snapshot.stableFacts),
    "",
    "## Timeline Anchors",
    ...toBullets(snapshot.timelineAnchors),
    "",
    "## Stable Decisions",
    ...toBullets(snapshot.stableDecisions.map((item) => item.decision)),
    "",
    "## Active Facts",
    ...toBullets(snapshot.activeFacts.map((item) => item.fact)),
    "",
    "## Recent Timeline",
    ...toBullets(snapshot.recentTimeline.map((item) => `${item.turnId} (${item.role}): ${item.summary}`)),
    "",
    "## Preserved Recent Turns",
    ...renderTailLines(tail),
    "",
    "## Archived Context",
    "### Archived Goals",
    ...toBullets(snapshot.archive.archivedGoals),
    "",
    "### Archived Questions",
    ...toBullets(snapshot.archive.archivedQuestions),
    "",
    "### Archived Facts",
    ...toBullets(snapshot.archive.archivedFacts),
    "",
  ].join("\n");
}

export function renderResumePrompt(snapshot: StateSnapshot, tail: SessionTurn[]): string {
  return [
    "You are continuing an existing long-running discussion.",
    "Do not restart the story from scratch.",
    "Use the stable background and current state as the primary frame.",
    "Use the preserved recent turns as the highest-fidelity short-range context.",
    "",
    "Required behavior:",
    "1. Restate the current objective in 3-6 bullets.",
    "2. Keep the named people and relationship context explicit.",
    "3. Preserve the stable facts and timeline anchors.",
    "4. Address the active questions before proposing a new direction.",
    "5. Continue from the preserved recent turns instead of flattening them into summary prose.",
    "",
    "## Current State",
    snapshot.currentState.summary || "(empty)",
    "",
    "### Current Objectives",
    ...toBullets(snapshot.currentState.currentObjectives),
    "",
    "### Current Stance",
    ...toBullets(snapshot.currentState.currentStance),
    "",
    "### Active Questions",
    ...toBullets(snapshot.currentState.activeQuestions),
    "",
    "### Next Actions",
    ...toBullets(snapshot.currentState.nextActions),
    "",
    "## Stable Background",
    snapshot.background.summary || "(none)",
    "",
    "### Emotional Context",
    ...toBullets(snapshot.background.emotionalContext),
    "",
    "### Working Frames",
    ...toBullets(snapshot.background.workingFrames),
    "",
    "## People Map",
    ...toPeopleBullets(snapshot.peopleMap),
    "",
    "## Stable Facts",
    ...toBullets(snapshot.stableFacts),
    "",
    "## Timeline Anchors",
    ...toBullets(snapshot.timelineAnchors),
    "",
    "## Stable Decisions",
    ...toBullets(snapshot.stableDecisions.map((item) => item.decision)),
    "",
    "## Active Facts",
    ...toBullets(snapshot.activeFacts.map((item) => item.fact)),
    "",
    "## Recent Timeline",
    ...toBullets(snapshot.recentTimeline.map((item) => `${item.turnId} (${item.role}): ${item.summary}`)),
    "",
    "## Preserved Recent Turns",
    ...renderTailLines(tail),
    "",
    "## Archived Context",
    "### Archived Goals",
    ...toBullets(snapshot.archive.archivedGoals),
    "",
    "### Archived Questions",
    ...toBullets(snapshot.archive.archivedQuestions),
    "",
    "### Archived Facts",
    ...toBullets(snapshot.archive.archivedFacts),
    "",
  ].join("\n");
}

function renderTailLines(tail: SessionTurn[]): string[] {
  if (!tail.length) return ["(none)"];

  return tail.flatMap((turn) => [
    `### [${turn.order}] ${turn.role.toUpperCase()} ${turn.id}`,
    turn.text || "(empty)",
    "",
  ]);
}

function toBullets(items: string[]): string[] {
  if (!items.length) return ["- (none)"];
  return items.map((item) => `- ${item}`);
}

function toPeopleBullets(items: StateSnapshot["peopleMap"]): string[] {
  if (!items.length) return ["- (none)"];

  return items.map((item) => {
    const relation = item.relation ? `: ${item.relation}` : "";
    const notes = item.notes ? ` ${item.notes}` : "";
    return `- ${item.name}${relation}${notes}`.trimEnd();
  });
}
