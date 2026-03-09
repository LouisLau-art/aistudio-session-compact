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

const MAX_ACTIVE_QUESTIONS = 3;
const MAX_ACTIVE_QUESTION_CHARS = 220;
const MAX_RECENT_TIMELINE_ITEMS = 12;
const MAX_INFERRED_STATE_ITEMS = 3;

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

  const currentObjectives = currentObjectiveMatches.length
    ? currentObjectiveMatches.map((match) => match.value)
    : inferCurrentObjectives(input.preservedTail, activeQuestions);
  const currentStance = currentStanceMatches.length
    ? currentStanceMatches.map((match) => match.value)
    : inferCurrentStance(input.preservedTail);
  const nextActions = nextActionMatches.length
    ? nextActionMatches.map((match) => match.value)
    : inferNextActions(input.preservedTail, activeQuestions);

  const stableDecisions: CapsuleDecision[] = currentStanceMatches.map((match) => ({
    decision: match.value,
    evidenceTurnIds: [match.turnId],
  }));
  const activeFacts: CapsuleFact[] = activeFactMatches.map((match) => ({
    fact: match.value,
    evidenceTurnIds: [match.turnId],
  }));

  const recentTimeline = input.preservedTail.slice(-MAX_RECENT_TIMELINE_ITEMS).map<StoryTimelineEntry>((turn) => ({
    turnId: turn.id,
    role: turn.role,
    summary: shorten(stripTurnPrefix(turn.text)),
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
        results.push(stripTurnPrefix(prefixed));
        continue;
      }

      const normalized = stripTurnPrefix(line.trim());
      if (/[?？]$/.test(normalized)) {
        results.push(normalized);
      }
    }
  }

  return uniq(results);
}

function collectRecentCurrentQuestions(turns: SessionTurn[], preservedTail: SessionTurn[]): string[] {
  const currentQuestionLines = collectMatches([...turns].reverse(), /^(?:current question)\s*:\s*(.+)$/i);
  if (currentQuestionLines.length) {
    return takePreferredQuestions(currentQuestionLines.map((question) => withQuestionMark(stripTurnPrefix(question.value))));
  }

  const userQuestions = collectQuestions(
    [...preservedTail]
      .reverse()
      .filter((turn) => turn.role === "user"),
  );

  return takePreferredQuestions(userQuestions);
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

function stripTurnPrefix(text: string): string {
  return text
    .replace(/^(?:Louis|刘新宇（Louis）|新宇（Louis）)[，,\s]*/i, "")
    .replace(/^(?:User|Model)\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*/i, "")
    .replace(/^(?:用户|模型)\s+\d{1,2}:\d{2}\s*/i, "")
    .trim();
}

function takePreferredQuestions(questions: string[]): string[] {
  const concise = questions.filter(isConciseQuestion);
  const preferred = concise.length ? concise : questions;
  return preferred.slice(0, MAX_ACTIVE_QUESTIONS);
}

function isConciseQuestion(question: string): boolean {
  if (question.length > MAX_ACTIVE_QUESTION_CHARS) return false;

  const clauseSeparators = question.split(/[，,；;：:、]/).length - 1;
  return clauseSeparators <= 3;
}

function inferCurrentObjectives(turns: SessionTurn[], activeQuestions: string[]): string[] {
  const candidates: string[] = [];

  for (const turn of [...turns].reverse()) {
    if (turn.role !== "user") continue;

    for (const sentence of splitSentences(turn.text)) {
      const normalized = normalizeStateSentence(sentence);
      if (!normalized) continue;

      if (/^(?:我(?:现在)?更具体的问题是[:：]?)\s*/.test(normalized)) {
        candidates.push(
          stripTrailingPunctuation(normalized.replace(/^(?:我(?:现在)?更具体的问题是[:：]?)\s*/, "")),
        );
        continue;
      }

      if (/^我(?:今晚)?要不要/.test(normalized) || /^我需要/.test(normalized) || /^我要去/.test(normalized)) {
        candidates.push(stripTrailingPunctuation(normalized));
      }
    }
  }

  if (!candidates.length && activeQuestions[0]) {
    candidates.push(stripTrailingPunctuation(activeQuestions[0]));
  }

  return uniq(candidates).slice(0, MAX_INFERRED_STATE_ITEMS);
}

function inferCurrentStance(turns: SessionTurn[]): string[] {
  const candidates: string[] = [];

  for (const turn of [...turns].reverse()) {
    if (turn.role !== "model") continue;

    for (const sentence of splitSentences(turn.text)) {
      const normalized = normalizeStateSentence(sentence);
      if (!normalized) continue;
      if (!/^(?:不要|别|先别|绝对不能|不能|必须|应该)/.test(normalized)) continue;
      if (normalized.length > 80) continue;
      candidates.push(withSentencePeriod(normalized));
    }
  }

  return uniq(candidates).slice(0, MAX_INFERRED_STATE_ITEMS);
}

function inferNextActions(turns: SessionTurn[], activeQuestions: string[]): string[] {
  const candidates: string[] = [];

  for (const turn of [...turns].reverse()) {
    if (turn.role !== "model") continue;

    for (const sentence of splitSentences(turn.text)) {
      const normalized = normalizeStateSentence(sentence);
      if (!normalized) continue;
      if (!/^(?:直接|先|就按|回复|发|问|关闭|稳住)/.test(normalized)) continue;
      if (normalized.length > 80) continue;
      candidates.push(withSentencePeriod(normalized));
    }
  }

  if (!candidates.length && activeQuestions[0]) {
    candidates.push(stripTrailingPunctuation(activeQuestions[0]));
  }

  return uniq(candidates).slice(0, MAX_INFERRED_STATE_ITEMS);
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r?\n/g, "\n")
    .split(/[\n]|(?<=[。！？!?])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalizeStateSentence(text: string): string {
  return stripTurnPrefix(text)
    .replace(/[*#>`"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrailingPunctuation(text: string): string {
  return text.replace(/[。！？!?]+$/u, "").trim();
}

function withSentencePeriod(text: string): string {
  return /[。！？!?]$/u.test(text) ? text : `${text}。`;
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
