export type TurnRole = "user" | "model" | "system" | "unknown";

export interface ImageRef {
  id: string;
  messageId: string;
  src: string;
  alt?: string;
  localPath?: string;
  index: number;
}

export interface SessionTurn {
  id: string;
  order: number;
  role: TurnRole;
  text: string;
  sourceUrl: string;
  roleHint?: string;
  images: ImageRef[];
}

export interface ImageEnrichment {
  imageId: string;
  messageId: string;
  src: string;
  localPath?: string;
  status: "ok" | "skipped" | "error";
  ocrText?: string;
  visualSummary?: string;
  relevanceToConversation?: string;
  rawResponse?: string;
  error?: string;
}

export interface ChunkSummary {
  summary: string;
  goals: string[];
  decisions: string[];
  constraints: string[];
  openQuestions: string[];
  todos: string[];
  keyFacts: string[];
}

export interface CapsuleDecision {
  decision: string;
  evidenceTurnIds: string[];
}

export interface CapsuleFact {
  fact: string;
  evidenceTurnIds: string[];
}

export interface CapsuleTimelineEntry {
  turnId: string;
  role: TurnRole;
  summary: string;
}

export interface CapsuleBackground {
  summary: string;
  emotionalContext: string[];
  workingFrames: string[];
}

export interface CapsulePerson {
  name: string;
  relation: string;
  notes?: string;
}

export type StoryBackground = CapsuleBackground;
export type StoryPerson = CapsulePerson;
export type StoryTimelineEntry = CapsuleTimelineEntry;

export interface StoryBriefing {
  background: StoryBackground;
  peopleMap: StoryPerson[];
  stableFacts: string[];
  timelineAnchors: string[];
}

export interface StateSnapshot {
  version: 2;
  meta: {
    createdAt: string;
    rawPath: string;
    turnCount: number;
    imageCount: number;
    chunkCount: number;
    mode: "llm" | "heuristic";
    modelUsed: string;
    strategy: string;
  };
  briefing: {
    sourcePath?: string;
    applied: boolean;
  };
  background: StoryBackground;
  peopleMap: StoryPerson[];
  stableFacts: string[];
  timelineAnchors: string[];
  currentState: {
    summary: string;
    currentObjectives: string[];
    currentStance: string[];
    activeQuestions: string[];
    nextActions: string[];
  };
  stableDecisions: CapsuleDecision[];
  activeFacts: CapsuleFact[];
  recentTimeline: StoryTimelineEntry[];
  archive: {
    archivedGoals: string[];
    archivedQuestions: string[];
    archivedFacts: string[];
  };
}

export interface CaptureRunReport {
  startedAt: string;
  finishedAt: string;
  sourceUrl: string;
  turnCount: number;
  imageCount: number;
  outputRawPath: string;
  outputImagesDir: string;
  notes: string[];
}
