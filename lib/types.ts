export type ProcessParticipant = {
  name: string;
  role: string;
  team?: string;
};

export type TranscriptTurn = {
  speaker: "atlas" | "participant";
  text: string;
};

export type SessionStatus = "draft" | "ready" | "processing";

export type Session = {
  id: string;
  participant: ProcessParticipant;
  date: string;
  durationSec: number;
  status: SessionStatus;
  turns: TranscriptTurn[];
  parentSessionId?: string;
  // Which Project this session was captured into. Absent on legacy/seed
  // sessions, which belong to the default K-12 workspace.
  projectId?: string;
};

export type Entity = {
  id: string;
  type: "person" | "process" | "system" | "initiative";
  name: string;
  attributes?: Record<string, string>;
};

export type Relationship = {
  id: string;
  source: string;
  target: string;
  type: "depends_on" | "owns" | "hands_off_to" | "uses" | "part_of";
  label?: string;
};

export type Graph = {
  entities: Entity[];
  relationships: Relationship[];
};

export type Insight = {
  id: string;
  type: "crossover" | "single_point_of_failure" | "concentration";
  title: string;
  entitiesInvolved: string[];
  explanation: string;
  recommendedAction: string;
  financialImpact: {
    headline: string;
    value: number;
    unit: string;
    basis: string;
  };
  confidence: "high" | "medium" | "low";
  needsHumanReview: boolean;
  whatToCheck?: string;
  status?: "open" | "confirmed" | "dismissed" | "escalated";
  escalationTarget?: string;
  escalationNote?: string;
};

export type Analysis = {
  processSummary: string;
  insights: Insight[];
  // Per-entity attributes Gemini estimated during analysis (e.g. hoursPerWeek),
  // keyed by entity id. Merged into the displayed graph for node detail cards.
  entityAttributes?: Record<string, Record<string, string>>;
};

// Lifecycle of a process-intelligence workspace as its pipeline fills in.
export type ProjectStatus = "empty" | "captured" | "mapped" | "analyzed";

// A named process-intelligence workspace. Scopes its own sessions, generated
// dependency graph, and analysis. NOT the same as a "process"-type graph Entity.
export type Project = {
  id: string;
  name: string;
  lineOfBusiness: string;
  description?: string;
  createdAt: string;
  sessionIds: string[];
  graph?: Graph;
  analysis?: Analysis;
  status: ProjectStatus;
};
