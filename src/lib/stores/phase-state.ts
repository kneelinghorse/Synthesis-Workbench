import { create } from "zustand";

import {
  DEFAULT_PHASE_ID,
  DEFAULT_PHASES,
  type PhaseDefinition,
  type PhaseId,
} from "@/types/phase";

export type ReviewGateDecision = "approved" | "blocked" | "pending";
export type WorkflowMode = "strict" | "flexible";

export type TransitionAssessment = {
  allowed: boolean;
  blockers: string[];
  gateStatus: ReviewGateDecision | null;
};

type PhaseState = {
  currentPhase: PhaseId;
  workflowMode: WorkflowMode;
  phaseHistory: PhaseId[];
  transitionBlockers: string[];
  gateDecisions: Partial<Record<PhaseId, ReviewGateDecision>>;
  seedPhase: (phase: PhaseId) => void;
  setWorkflowMode: (mode: WorkflowMode) => void;
  setGateDecision: (phase: PhaseId, status: ReviewGateDecision) => void;
  clearGateDecision: (phase: PhaseId) => void;
  canTransitionTo: (phase: PhaseId, phases?: PhaseDefinition[]) => TransitionAssessment;
  transitionTo: (phase: PhaseId, phases?: PhaseDefinition[]) => TransitionAssessment;
  reset: () => void;
};

const resolvePhaseDefinition = (
  target: PhaseId,
  phases?: PhaseDefinition[]
) =>
  phases?.find((phase) => phase.id === target) ??
  DEFAULT_PHASES.find((phase) => phase.id === target);

export const usePhaseStore = create<PhaseState>((set, get) => ({
  currentPhase: DEFAULT_PHASE_ID,
  workflowMode: "strict",
  phaseHistory: [DEFAULT_PHASE_ID],
  transitionBlockers: [],
  gateDecisions: {},
  seedPhase: (phase) =>
    set((state) => {
      if (
        state.phaseHistory.length > 1 ||
        state.currentPhase !== DEFAULT_PHASE_ID
      ) {
        return state;
      }
      return {
        ...state,
        currentPhase: phase,
        phaseHistory: [phase],
      };
    }),
  setWorkflowMode: (mode) =>
    set((state) => ({
      ...state,
      workflowMode: mode,
    })),
  setGateDecision: (phase, status) =>
    set((state) => ({
      gateDecisions: {
        ...state.gateDecisions,
        [phase]: status,
      },
    })),
  clearGateDecision: (phase) =>
    set((state) => {
      const nextGateDecisions = { ...state.gateDecisions };
      delete nextGateDecisions[phase];
      return { gateDecisions: nextGateDecisions };
    }),
  canTransitionTo: (target, phases) => {
    const { currentPhase, gateDecisions, workflowMode } = get();
    const blockers: string[] = [];
    const definition = resolvePhaseDefinition(target, phases);
    const gateStatus = gateDecisions[target] ?? null;

    if (target === currentPhase) {
      blockers.push("Already in the selected phase.");
    }

    if (gateStatus === "blocked") {
      blockers.push("Review gate blocked this transition.");
    }

    if (workflowMode === "strict") {
      if (gateStatus === "pending") {
        blockers.push("Review gate approval is still pending.");
      }

      if (definition?.requiresReview && gateStatus === null) {
        blockers.push("Human review required before entering this phase.");
      }
    }

    return {
      allowed: blockers.length === 0,
      blockers,
      gateStatus,
    };
  },
  transitionTo: (target, phases) => {
    const assessment = get().canTransitionTo(target, phases);
    if (!assessment.allowed) {
      set({ transitionBlockers: assessment.blockers });
      return assessment;
    }

    set((state) => ({
      currentPhase: target,
      phaseHistory: [...state.phaseHistory, target],
      transitionBlockers: [],
      gateDecisions: state.gateDecisions,
    }));

    return {
      ...assessment,
      blockers: [],
      gateStatus: get().gateDecisions[target] ?? null,
      allowed: true,
    };
  },
  reset: () =>
    set({
      currentPhase: DEFAULT_PHASE_ID,
      workflowMode: "strict",
      phaseHistory: [DEFAULT_PHASE_ID],
      transitionBlockers: [],
      gateDecisions: {},
    }),
}));

export const resetPhaseState = () => {
  usePhaseStore.setState({
    currentPhase: DEFAULT_PHASE_ID,
    workflowMode: "strict",
    phaseHistory: [DEFAULT_PHASE_ID],
    transitionBlockers: [],
    gateDecisions: {},
  });
};
