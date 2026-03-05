import type { ContextCapsule } from "../types.js";

export function renderHandoffMarkdown(capsule: ContextCapsule): string {
  return [
    "# Session Handoff",
    "",
    `- Generated at: ${capsule.meta.createdAt}`,
    `- Turns: ${capsule.meta.turnCount}`,
    `- Images: ${capsule.meta.imageCount}`,
    `- Compression mode: ${capsule.meta.mode}`,
    "",
    "## Session Summary",
    capsule.sessionSummary || "(empty)",
    "",
    "## Goals",
    ...toBullets(capsule.goals),
    "",
    "## Locked Decisions",
    ...toBullets(capsule.decisions.map((item) => item.decision)),
    "",
    "## Constraints",
    ...toBullets(capsule.constraints),
    "",
    "## Open Questions",
    ...toBullets(capsule.openQuestions),
    "",
    "## TODOs",
    ...toBullets(capsule.todos),
    "",
    "## Key Facts",
    ...toBullets(capsule.keyFacts.map((item) => item.fact)),
    "",
    "## Resume Brief",
    capsule.resumeBrief,
    "",
  ].join("\n");
}

export function renderResumePrompt(capsule: ContextCapsule): string {
  const payload = JSON.stringify(capsule, null, 2);

  return [
    "You are continuing an existing long-running discussion.",
    "Do not restart the project from scratch.",
    "Preserve previous decisions unless explicitly overridden.",
    "Use the provided capsule as source of truth for prior context.",
    "",
    "Required behavior:",
    "1. Restate the current objective in 3-6 bullets.",
    "2. Confirm locked decisions and constraints.",
    "3. Address open questions before proposing new architecture.",
    "4. Continue from the latest TODOs.",
    "",
    "Context capsule JSON:",
    "```json",
    payload,
    "```",
  ].join("\n");
}

function toBullets(items: string[]): string[] {
  if (!items.length) return ["- (none)"];
  return items.map((item) => `- ${item}`);
}
