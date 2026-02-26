export type PhaseId = "ingest" | "explore" | "tune" | "review" | "done";

export type PhaseDefinition = {
  id: PhaseId;
  label: string;
  description: string;
  requiresReview?: boolean;
};

export const DEFAULT_PHASE_ID: PhaseId = "ingest";

export const DEFAULT_PHASES: PhaseDefinition[] = [
  {
    id: "ingest",
    label: "Ingest Research",
    description: "Load and parse the Stage1 Inspector bundle.",
  },
  {
    id: "explore",
    label: "Explore Patterns",
    description: "Review detected patterns and component options.",
  },
  {
    id: "tune",
    label: "Tune Tokens",
    description: "Adjust tokens and validate live preview output.",
  },
  {
    id: "review",
    label: "Review & Approve",
    description: "Request human approval before finalizing changes.",
  },
  {
    id: "done",
    label: "Complete",
    description: "Finalize export and capture approvals.",
    requiresReview: true,
  },
];
