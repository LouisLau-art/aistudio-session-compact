export interface Persona {
  name: string;
  coreIdentity: {
    education: string;
    careerStage: string;
    technicalStack: string[];
  };
  relationships: Array<{
    person: string;
    status: string;
    notes: string[];
  }>;
  preferences: {
    communication: string[];
    workflow: string[];
    music: string[];
  };
  currentState: {
    jobSearch: {
      status: string;
      targetRoles: string[];
      progress: any;
    };
    health: {
      recentInjuries: string[];
    };
  };
}

export interface TimelineEvent {
  id: string;
  date: string;
  category: "emotional" | "decision" | "milestone" | "project" | "health";
  title: string;
  summary: string;
  evidenceTurnIds: string[];
  tags: string[];
}

export interface Chunk {
  id: string;
  sourceSessionId: string;
  sourceTurnIds: string[];
  content: string;
  topic: string;
  metadata: {
    date: string;
    hasImages: boolean;
    emotionalIntensity: "low" | "medium" | "high";
  };
  embedding?: number[];
}

export interface MemoryIndex {
  persona: Persona;
  facts: string[];
  projects: Array<{
    name: string;
    description: string;
    techStack: string[];
    timeline: string;
  }>;
}
