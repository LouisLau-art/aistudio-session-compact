import type {
  CapsuleDecision,
  CapsuleFact,
  SessionTurn,
  StateSnapshot,
  StoryBriefing,
  StoryTimelineEntry,
} from "../types.js";

export interface BuildStateSnapshotInput {
  rawPath: string;
  turns: SessionTurn[];
  preservedTail: SessionTurn[];
  modelUsed: string;
  mode: "llm" | "heuristic";
  briefing?: StoryBriefing;
  briefingPath?: string;
}

const EMPTY_BACKGROUND = {
  summary: "",
  emotionalContext: [] as string[],
  workingFrames: [] as string[],
};

export function buildStateSnapshot(input: BuildStateSnapshotInput): StateSnapshot {
  const preservedIds = new Set(input.preservedTail.map((turn) => turn.id));
  const archiveTurns = input.turns.filter((turn) => !preservedIds.has(turn.id));

  const currentObjectiveMatches = collectRecentMatches(
    input.turns,
    /^(?:current objective|current objectives?|current focus|focus)\s*:\s*(.+)$/i,
  );
  const currentStanceMatches = collectRecentMatches(
    input.turns,
    /^(?:current stance|stance|decision)\s*:\s*(.+)$/i,
  );
  const activeQuestions = collectRecentCurrentQuestions(input.turns, input.preservedTail);
  const nextActionMatches = collectRecentMatches(input.turns, /^(?:next action|next step|action)\s*:\s*(.+)$/i);
  const activeFactMatches = collectMatches(
    input.preservedTail,
    /^(?:active fact|fact|status|situation)\s*:\s*(.+)$/i,
  );

  const currentObjectives = currentObjectiveMatches.map((match) => match.value);
  const currentStance = currentStanceMatches.map((match) => match.value);
  const nextActions = nextActionMatches.map((match) => match.value);

  const stableDecisions: CapsuleDecision[] = currentStanceMatches.map((match) => ({
    decision: match.value,
    evidenceTurnIds: [match.turnId],
  }));
  const activeFacts: CapsuleFact[] = activeFactMatches.map((match) => ({
    fact: match.value,
    evidenceTurnIds: [match.turnId],
  }));

  const recentTimeline = input.preservedTail.map<StoryTimelineEntry>((turn) => ({
    turnId: turn.id,
    role: turn.role,
    summary: shorten(turn.text),
  }));

  const archivedGoals = collectMatches(archiveTurns, /^(?:goal|objective)\s*:\s*(.+)$/i).map((match) => match.value);
  const archivedQuestions = collectQuestions(archiveTurns);
  const archivedFacts = collectMatches(archiveTurns, /^(?:fact|status|situation)\s*:\s*(.+)$/i).map(
    (match) => match.value,
  );

  return {
    version: 2,
    meta: {
      createdAt: new Date().toISOString(),
      rawPath: input.rawPath,
      turnCount: input.turns.length,
      imageCount: input.turns.reduce((total, turn) => total + turn.images.length, 0),
      chunkCount: 1,
      mode: input.mode,
      modelUsed: input.modelUsed,
      strategy: "briefing-plus-state-plus-tail",
    },
    briefing: {
      sourcePath: input.briefingPath,
      applied: Boolean(input.briefing),
    },
    background: input.briefing?.background ?? EMPTY_BACKGROUND,
    peopleMap: input.briefing?.peopleMap ?? [],
    stableFacts: input.briefing?.stableFacts ?? [],
    timelineAnchors: input.briefing?.timelineAnchors ?? [],
    currentState: {
      summary: summarizeCurrentState({
        currentObjectives,
        currentStance,
        activeQuestions,
        nextActions,
      }),
      currentObjectives,
      currentStance,
      activeQuestions,
      nextActions,
    },
    stableDecisions,
    activeFacts,
    recentTimeline,
    archive: {
      archivedGoals,
      archivedQuestions,
      archivedFacts,
    },
  };
}

function collectMatches(turns: SessionTurn[], pattern: RegExp): Array<{ value: string; turnId: string }> {
  const results: Array<{ value: string; turnId: string }> = [];

  for (const turn of turns) {
    for (const line of splitLines(turn.text)) {
      const match = line.match(pattern);
      const value = match?.[1]?.trim();
      if (value) {
        results.push({ value, turnId: turn.id });
      }
    }
  }

  return uniqMatches(results);
}

function collectRecentMatches(turns: SessionTurn[], pattern: RegExp): Array<{ value: string; turnId: string }> {
  return collectMatches([...turns].reverse(), pattern);
}

function collectQuestions(turns: SessionTurn[]): string[] {
  const results: string[] = [];

  for (const turn of turns) {
    for (const line of splitLines(turn.text)) {
      const prefixed = line.match(/^(?:current question|question)\s*:\s*(.+)$/i)?.[1]?.trim();
      if (prefixed) {
        results.push(prefixed);
        continue;
      }

      if (/[?？]$/.test(line.trim())) {
        results.push(line.trim());
      }
    }
  }

  return uniq(results);
}

function collectRecentCurrentQuestions(turns: SessionTurn[], preservedTail: SessionTurn[]): string[] {
  const currentQuestionLines = collectMatches([...turns].reverse(), /^(?:current question)\s*:\s*(.+)$/i);
  if (currentQuestionLines.length) {
    return currentQuestionLines.map((question) => withQuestionMark(question.value));
  }

  return collectQuestions([...preservedTail].reverse());
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

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

function uniqMatches(items: Array<{ value: string; turnId: string }>): Array<{ value: string; turnId: string }> {
  const seen = new Set<string>();
  const result: Array<{ value: string; turnId: string }> = [];

  for (const item of items) {
    const normalized = item.value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ value: normalized, turnId: item.turnId });
  }

  return result;
}

function shorten(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function withQuestionMark(text: string): string {
  return /[?？]$/.test(text) ? text : `${text}?`;
}

function summarizeCurrentState(input: {
  currentObjectives: string[];
  currentStance: string[];
  activeQuestions: string[];
  nextActions: string[];
}): string {
  const lines = [
    input.currentObjectives[0] ? `Current objective: ${input.currentObjectives[0]}` : "",
    input.currentStance[0] ? `Current stance: ${input.currentStance[0]}` : "",
    input.activeQuestions[0] ? `Active question: ${input.activeQuestions[0]}` : "",
    input.nextActions[0] ? `Next action: ${input.nextActions[0]}` : "",
  ].filter(Boolean);

  return lines.join(" | ") || "(empty)";
}
