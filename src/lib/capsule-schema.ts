import { z } from "zod";

import type {
  CapsuleBackground,
  CapsuleDecision,
  CapsuleFact,
  CapsulePerson,
  CapsuleTimelineEntry,
  ContextCapsule,
} from "../types.js";

const decisionSchema = z.object({
  decision: z.string(),
  evidenceTurnIds: z.array(z.string()).default([]),
});

const factSchema = z.object({
  fact: z.string(),
  evidenceTurnIds: z.array(z.string()).default([]),
});

const timelineSchema = z.object({
  turnId: z.string(),
  role: z.enum(["user", "model", "system", "unknown"]),
  summary: z.string(),
});

const backgroundSchema = z.object({
  summary: z.string().default(""),
  emotionalContext: z.array(z.string()).default([]),
  workingFrames: z.array(z.string()).default([]),
});

const personSchema = z.object({
  name: z.string(),
  relation: z.string().default(""),
  notes: z.string().optional(),
});

const rawCapsuleSchema = z
  .object({
    meta: z
      .object({
        createdAt: z.string().optional(),
        rawPath: z.string().optional(),
        turnCount: z.number().int().nonnegative().optional(),
        imageCount: z.number().int().nonnegative().optional(),
        chunkCount: z.number().int().nonnegative().optional(),
        modelUsed: z.string().optional(),
        mode: z.enum(["llm", "heuristic"]).optional(),
      })
      .optional(),
    sessionSummary: z.string().optional(),
    background: backgroundSchema.partial().optional(),
    peopleMap: z.array(personSchema.partial()).optional(),
    currentState: z
      .object({
        summary: z.string().optional(),
        currentObjectives: z.array(z.string()).optional(),
        currentStance: z.array(z.string()).optional(),
        nextTopics: z.array(z.string()).optional(),
      })
      .optional(),
    goals: z.array(z.string()).optional(),
    decisions: z.array(z.union([z.string(), decisionSchema])).optional(),
    stableDecisions: z.array(z.union([z.string(), decisionSchema])).optional(),
    constraints: z.array(z.string()).optional(),
    openQuestions: z.array(z.string()).optional(),
    todos: z.array(z.string()).optional(),
    keyFacts: z.array(z.union([z.string(), factSchema])).optional(),
    timeline: z.array(timelineSchema).optional(),
    recentTimeline: z.array(timelineSchema).optional(),
    appendix: z
      .object({
        archivedGoals: z.array(z.string()).optional(),
        archivedQuestions: z.array(z.string()).optional(),
        archivedFacts: z.array(z.string()).optional(),
      })
      .optional(),
    resumeBrief: z.string().optional(),
  })
  .passthrough();

function uniqStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function normalizeDecisions(items: Array<string | CapsuleDecision> | undefined): CapsuleDecision[] {
  return (items ?? []).map((item) => {
    if (typeof item === "string") {
      return { decision: item, evidenceTurnIds: [] } satisfies CapsuleDecision;
    }

    return {
      decision: item.decision,
      evidenceTurnIds: item.evidenceTurnIds ?? [],
    } satisfies CapsuleDecision;
  });
}

function normalizeFacts(items: Array<string | CapsuleFact> | undefined): CapsuleFact[] {
  return (items ?? []).map((item) => {
    if (typeof item === "string") {
      return { fact: item, evidenceTurnIds: [] } satisfies CapsuleFact;
    }

    return {
      fact: item.fact,
      evidenceTurnIds: item.evidenceTurnIds ?? [],
    } satisfies CapsuleFact;
  });
}

function normalizeBackground(background: Partial<CapsuleBackground> | undefined): CapsuleBackground {
  return {
    summary: background?.summary?.trim() ?? "",
    emotionalContext: uniqStrings(background?.emotionalContext ?? []),
    workingFrames: uniqStrings(background?.workingFrames ?? []),
  };
}

function normalizePeople(people: Array<Partial<CapsulePerson>> | undefined): CapsulePerson[] {
  return (people ?? [])
    .filter((item): item is Partial<CapsulePerson> & { name: string } => Boolean(item?.name?.trim()))
    .map((item) => ({
      name: item.name.trim(),
      relation: item.relation?.trim() ?? "",
      notes: item.notes?.trim() || undefined,
    }));
}

function makeSummaryFallback(input: {
  sessionSummary: string;
  goals: string[];
  decisions: CapsuleDecision[];
  constraints: string[];
  openQuestions: string[];
  todos: string[];
  keyFacts: CapsuleFact[];
}): string {
  if (input.sessionSummary.trim()) {
    return input.sessionSummary.trim();
  }

  const lines = [
    input.goals[0] ? `Current focus: ${input.goals[0]}` : "",
    input.decisions[0]?.decision ? `Working guidance: ${input.decisions[0].decision}` : "",
    input.constraints[0] ? `Constraint: ${input.constraints[0]}` : "",
    input.openQuestions[0] ? `Open question: ${input.openQuestions[0]}` : "",
    input.todos[0] ? `Next step: ${input.todos[0]}` : "",
    input.keyFacts[0]?.fact ? `Key fact: ${input.keyFacts[0].fact}` : "",
  ].filter(Boolean);

  return lines.length ? lines.join("\n") : "(empty)";
}

export function normalizeContextCapsule(raw: unknown): ContextCapsule {
  const hasStableDecisions =
    typeof raw === "object" && raw !== null && Object.prototype.hasOwnProperty.call(raw, "stableDecisions");
  const parsed = rawCapsuleSchema.parse(raw);

  const decisions = normalizeDecisions(parsed.decisions);
  const explicitStableDecisions = normalizeDecisions(parsed.stableDecisions);
  const stableDecisions = hasStableDecisions ? explicitStableDecisions : decisions;
  const keyFacts = normalizeFacts(parsed.keyFacts);
  const goals = uniqStrings(parsed.goals ?? []);
  const constraints = uniqStrings(parsed.constraints ?? []);
  const openQuestions = uniqStrings(parsed.openQuestions ?? []);
  const todos = uniqStrings(parsed.todos ?? []);
  const timeline = parsed.timeline ?? [];
  const normalizedBackground = normalizeBackground(parsed.background);
  const normalizedPeople = normalizePeople(parsed.peopleMap);
  const currentObjectives = uniqStrings(parsed.currentState?.currentObjectives ?? goals);
  const currentStance = uniqStrings(
    parsed.currentState?.currentStance ?? [...stableDecisions.map((item) => item.decision), ...constraints],
  );
  const nextTopics = uniqStrings(parsed.currentState?.nextTopics ?? [...openQuestions, ...todos]);
  const summary =
    parsed.currentState?.summary?.trim() ||
    makeSummaryFallback({
      sessionSummary: parsed.sessionSummary ?? "",
      goals,
      decisions: stableDecisions.length ? stableDecisions : decisions,
      constraints,
      openQuestions,
      todos,
      keyFacts,
    });

  return {
    meta: {
      createdAt: parsed.meta?.createdAt ?? new Date(0).toISOString(),
      rawPath: parsed.meta?.rawPath ?? "",
      turnCount: parsed.meta?.turnCount ?? 0,
      imageCount: parsed.meta?.imageCount ?? 0,
      chunkCount: parsed.meta?.chunkCount ?? 0,
      modelUsed: parsed.meta?.modelUsed ?? "unknown",
      mode: parsed.meta?.mode ?? "heuristic",
    },
    sessionSummary: parsed.sessionSummary?.trim() || summary,
    background: normalizedBackground,
    peopleMap: normalizedPeople,
    currentState: {
      summary,
      currentObjectives,
      currentStance,
      nextTopics,
    },
    goals,
    decisions,
    stableDecisions,
    constraints,
    openQuestions,
    todos,
    keyFacts,
    timeline,
    recentTimeline: parsed.recentTimeline ?? timeline.slice(-6),
    appendix: {
      archivedGoals: uniqStrings(parsed.appendix?.archivedGoals ?? []),
      archivedQuestions: uniqStrings(parsed.appendix?.archivedQuestions ?? []),
      archivedFacts: uniqStrings(parsed.appendix?.archivedFacts ?? []),
    },
    resumeBrief: parsed.resumeBrief?.trim() || summary,
  };
}
