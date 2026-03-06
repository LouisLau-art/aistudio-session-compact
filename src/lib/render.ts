import type { ContextCapsule } from "../types.js";
import { normalizeContextCapsule } from "./capsule-schema.js";

export function renderHandoffMarkdown(capsule: ContextCapsule): string {
  const normalized = normalizeContextCapsule(capsule);

  return [
    "# Session Handoff",
    "",
    `- Generated at: ${normalized.meta.createdAt}`,
    `- Turns: ${normalized.meta.turnCount}`,
    `- Images: ${normalized.meta.imageCount}`,
    `- Compression mode: ${normalized.meta.mode}`,
    "",
    "## Background",
    normalized.background.summary || "(none)",
    "",
    "### Emotional Context",
    ...toBullets(normalized.background.emotionalContext),
    "",
    "### Working Frames",
    ...toBullets(normalized.background.workingFrames),
    "",
    "## People Map",
    ...toPeopleBullets(normalized.peopleMap),
    "",
    "## Current State",
    normalized.currentState.summary || "(empty)",
    "",
    "### Current Objectives",
    ...toBullets(normalized.currentState.currentObjectives),
    "",
    "### Current Stance",
    ...toBullets(normalized.currentState.currentStance),
    "",
    "### Next Topics",
    ...toBullets(normalized.currentState.nextTopics),
    "",
    "## Stable Decisions",
    ...toBullets(normalized.stableDecisions.map((item) => item.decision)),
    "",
    "## Active Facts",
    ...toBullets(normalized.keyFacts.map((item) => item.fact)),
    "",
    "## Active Constraints",
    ...toBullets(normalized.constraints),
    "",
    "## Active Open Questions",
    ...toBullets(normalized.openQuestions),
    "",
    "## Recent Timeline",
    ...toBullets(normalized.recentTimeline.map((item) => `${item.turnId} (${item.role}): ${item.summary}`)),
    "",
    "## Appendix",
    "### Archived Goals",
    ...toBullets(normalized.appendix.archivedGoals),
    "",
    "### Archived Questions",
    ...toBullets(normalized.appendix.archivedQuestions),
    "",
    "### Archived Facts",
    ...toBullets(normalized.appendix.archivedFacts),
    "",
    "## Resume Brief",
    normalized.resumeBrief,
    "",
  ].join("\n");
}

export function renderResumePrompt(capsule: ContextCapsule): string {
  const normalized = normalizeContextCapsule(capsule);

  return [
    "You are continuing an existing long-running discussion.",
    "Do not restart the project from scratch.",
    "Preserve previous decisions unless explicitly overridden.",
    "Use the provided capsule as source of truth for prior context.",
    "Treat the background and people map as higher-priority framing than noisy historical fragments.",
    "",
    "Required behavior:",
    "1. Restate the current objective in 3-6 bullets.",
    "2. Keep the relationship and character context explicit instead of flattening everyone into generic placeholders.",
    "3. Confirm locked decisions, active facts, and constraints.",
    "4. Address open questions before proposing new architecture.",
    "5. Continue from the latest TODOs.",
    "",
    "## Background",
    normalized.background.summary || "(none)",
    "",
    "### Emotional Context",
    ...toBullets(normalized.background.emotionalContext),
    "",
    "### Working Frames",
    ...toBullets(normalized.background.workingFrames),
    "",
    "## People Map",
    ...toPeopleBullets(normalized.peopleMap),
    "",
    "## Current State",
    normalized.currentState.summary || "(empty)",
    "",
    "### Current Objectives",
    ...toBullets(normalized.currentState.currentObjectives),
    "",
    "### Current Stance",
    ...toBullets(normalized.currentState.currentStance),
    "",
    "### Next Topics",
    ...toBullets(normalized.currentState.nextTopics),
    "",
    "## Stable Decisions",
    ...toBullets(normalized.stableDecisions.map((item) => item.decision)),
    "",
    "## Active Facts",
    ...toBullets(normalized.keyFacts.map((item) => item.fact)),
    "",
    "## Active Constraints",
    ...toBullets(normalized.constraints),
    "",
    "## Active Open Questions",
    ...toBullets(normalized.openQuestions),
    "",
    "## Recent Timeline",
    ...toBullets(normalized.recentTimeline.map((item) => `${item.turnId} (${item.role}): ${item.summary}`)),
    "",
    "## Appendix",
    "### Archived Goals",
    ...toBullets(normalized.appendix.archivedGoals),
    "",
    "### Archived Questions",
    ...toBullets(normalized.appendix.archivedQuestions),
    "",
    "### Archived Facts",
    ...toBullets(normalized.appendix.archivedFacts),
    "",
    "## Resume Brief",
    normalized.resumeBrief || "(empty)",
  ].join("\n");
}

function toBullets(items: string[]): string[] {
  if (!items.length) return ["- (none)"];
  return items.map((item) => `- ${item}`);
}

function toPeopleBullets(items: ContextCapsule["peopleMap"]): string[] {
  if (!items.length) return ["- (none)"];

  return items.map((item) => {
    const relation = item.relation ? `: ${item.relation}` : "";
    const notes = item.notes ? ` ${item.notes}` : "";
    return `- ${item.name}${relation}${notes}`.trimEnd();
  });
}
