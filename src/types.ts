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

export interface ContextCapsule {
  meta: {
    createdAt: string;
    rawPath: string;
    turnCount: number;
    imageCount: number;
    chunkCount: number;
    modelUsed: string;
    mode: "llm" | "heuristic";
  };
  sessionSummary: string;
  goals: string[];
  decisions: Array<{ decision: string; evidenceTurnIds: string[] }>;
  constraints: string[];
  openQuestions: string[];
  todos: string[];
  keyFacts: Array<{ fact: string; evidenceTurnIds: string[] }>;
  timeline: Array<{ turnId: string; role: TurnRole; summary: string }>;
  resumeBrief: string;
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
