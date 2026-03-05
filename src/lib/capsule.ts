import type { ChunkSummary, ContextCapsule, SessionTurn, TurnRole } from "../types.js";

function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function shortText(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function heuristicChunkSummary(turns: SessionTurn[]): ChunkSummary {
  const body = turns.map((turn) => `${turn.role.toUpperCase()}: ${turn.text}`).join("\n");
  const lines = body.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  const pick = (regex: RegExp, limit = 6): string[] => {
    return uniq(lines.filter((line) => regex.test(line)).slice(0, limit).map((line) => shortText(line, 220)));
  };

  const summary = shortText(lines.slice(0, 12).join(" "), 800);

  return {
    summary,
    goals: pick(/\b(goal|need|want|目标|希望|需要|计划)\b/i, 8),
    decisions: pick(/\b(decide|decision|选择|决定|方案|采用)\b/i, 8),
    constraints: pick(/\b(limit|constraint|cannot|must|限制|必须|不能)\b/i, 8),
    openQuestions: pick(/\?|\b(question|unclear|待确认|还没确定)\b/i, 8),
    todos: pick(/\b(todo|next step|action item|待办|下一步|需要做)\b/i, 10),
    keyFacts: pick(/\b(is|are|because|fact|背景|现状|已经)\b/i, 10),
  };
}

export function buildContextCapsule(input: {
  rawPath: string;
  turns: SessionTurn[];
  chunkSummaries: Array<{ turnIds: string[]; summary: ChunkSummary }>;
  modelUsed: string;
  mode: "llm" | "heuristic";
}): ContextCapsule {
  const allGoals = uniq(input.chunkSummaries.flatMap((chunk) => chunk.summary.goals));
  const allDecisions = uniq(input.chunkSummaries.flatMap((chunk) => chunk.summary.decisions));
  const allConstraints = uniq(input.chunkSummaries.flatMap((chunk) => chunk.summary.constraints));
  const allQuestions = uniq(input.chunkSummaries.flatMap((chunk) => chunk.summary.openQuestions));
  const allTodos = uniq(input.chunkSummaries.flatMap((chunk) => chunk.summary.todos));
  const allFacts = uniq(input.chunkSummaries.flatMap((chunk) => chunk.summary.keyFacts));

  const sessionSummary = uniq(input.chunkSummaries.map((chunk) => chunk.summary.summary)).join("\n\n");

  const timeline = input.turns.map((turn) => ({
    turnId: turn.id,
    role: turn.role,
    summary: shortText(turn.text, 200),
  }));

  const evidenceFor = (needle: string): string[] => {
    const low = needle.toLowerCase();
    return input.turns
      .filter((turn) => turn.text.toLowerCase().includes(low.split(" ")[0] ?? ""))
      .slice(0, 4)
      .map((turn) => turn.id);
  };

  const resumeBrief = [
    "Continue the same project with the existing constraints and decisions.",
    allGoals.length ? `Top goals: ${allGoals.slice(0, 5).join("; ")}` : "",
    allDecisions.length ? `Locked decisions: ${allDecisions.slice(0, 5).join("; ")}` : "",
    allQuestions.length ? `Open questions: ${allQuestions.slice(0, 5).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    meta: {
      createdAt: new Date().toISOString(),
      rawPath: input.rawPath,
      turnCount: input.turns.length,
      imageCount: input.turns.reduce((count, turn) => count + turn.images.length, 0),
      chunkCount: input.chunkSummaries.length,
      modelUsed: input.modelUsed,
      mode: input.mode,
    },
    sessionSummary,
    goals: allGoals,
    decisions: allDecisions.map((decision) => ({
      decision,
      evidenceTurnIds: evidenceFor(decision),
    })),
    constraints: allConstraints,
    openQuestions: allQuestions,
    todos: allTodos,
    keyFacts: allFacts.map((fact) => ({
      fact,
      evidenceTurnIds: evidenceFor(fact),
    })),
    timeline,
    resumeBrief,
  };
}

export function formatChunkForModel(turns: SessionTurn[]): string {
  return turns
    .map((turn) => {
      const imageNote = turn.images.length
        ? `\n[images: ${turn.images.map((img) => img.localPath ?? img.src).join(", ")}]`
        : "";
      return `(${turn.id}) ${turn.role.toUpperCase()}: ${turn.text}${imageNote}`;
    })
    .join("\n\n");
}

export function normalizeRoleForPrompt(role: TurnRole): string {
  if (role === "model") return "assistant";
  if (role === "user") return "user";
  return role;
}
