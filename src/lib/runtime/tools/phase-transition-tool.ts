import type { PhaseDefinition, PhaseId } from "@/types/phase";

export const PHASE_TRANSITION_TOOL_NAME = "transition_phase";

export type PhaseTransitionToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  phases?: PhaseDefinition[];
  currentPhase?: PhaseId;
};

export type PhaseTransitionToolResult = {
  previousPhase: PhaseId;
  nextPhase: PhaseId;
  approved: boolean;
  blockedByGate?: boolean;
  note?: string;
  resolvedAt: string;
};
