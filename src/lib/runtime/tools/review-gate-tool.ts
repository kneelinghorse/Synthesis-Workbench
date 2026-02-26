import type { ReviewGateDecision } from "@/lib/stores/phase-state";
import type { PhaseDefinition, PhaseId } from "@/types/phase";

export const REVIEW_GATE_TOOL_NAME = "review_gate";

export type ReviewGateToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  phases?: PhaseDefinition[];
  targetPhase?: PhaseId;
};

export type ReviewGateToolResult = {
  phase: PhaseId;
  decision: ReviewGateDecision;
  note?: string;
  resolvedAt: string;
};
