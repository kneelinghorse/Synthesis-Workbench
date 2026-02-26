import { beforeEach, describe, expect, it } from "vitest";

import { resetPhaseState, usePhaseStore } from "./phase-state";
import { DEFAULT_PHASE_ID, DEFAULT_PHASES } from "@/types/phase";

describe("usePhaseStore", () => {
  beforeEach(() => {
    resetPhaseState();
  });

  it("initializes with the default phase", () => {
    const state = usePhaseStore.getState();
    expect(state.currentPhase).toBe(DEFAULT_PHASE_ID);
    expect(state.workflowMode).toBe("strict");
    expect(state.phaseHistory).toEqual([DEFAULT_PHASE_ID]);
  });

  it("seeds the initial phase once", () => {
    const state = usePhaseStore.getState();
    state.seedPhase("explore");
    expect(usePhaseStore.getState().currentPhase).toBe("explore");

    state.transitionTo("tune", DEFAULT_PHASES);
    state.seedPhase("ingest");
    expect(usePhaseStore.getState().currentPhase).toBe("tune");
  });

  it("transitions when allowed", () => {
    const state = usePhaseStore.getState();
    const outcome = state.transitionTo("explore", DEFAULT_PHASES);
    expect(outcome.allowed).toBe(true);
    expect(usePhaseStore.getState().currentPhase).toBe("explore");
    expect(usePhaseStore.getState().phaseHistory).toEqual([
      DEFAULT_PHASE_ID,
      "explore",
    ]);
  });

  it("blocks transitions to done when review gate is pending", () => {
    const state = usePhaseStore.getState();
    state.transitionTo("explore", DEFAULT_PHASES);
    state.transitionTo("tune", DEFAULT_PHASES);
    state.transitionTo("review", DEFAULT_PHASES);
    state.setGateDecision("done", "pending");
    const outcome = state.transitionTo("done", DEFAULT_PHASES);
    expect(outcome.allowed).toBe(false);
    expect(usePhaseStore.getState().currentPhase).toBe("review");
    expect(outcome.blockers.length).toBeGreaterThan(0);
  });

  it("allows transition to done when review gate is approved", () => {
    const state = usePhaseStore.getState();
    state.transitionTo("explore", DEFAULT_PHASES);
    state.transitionTo("tune", DEFAULT_PHASES);
    state.transitionTo("review", DEFAULT_PHASES);
    state.setGateDecision("done", "approved");
    const outcome = state.transitionTo("done", DEFAULT_PHASES);
    expect(outcome.allowed).toBe(true);
    expect(usePhaseStore.getState().currentPhase).toBe("done");
  });

  it("allows transition to review-gated phases in flexible mode", () => {
    const state = usePhaseStore.getState();
    state.transitionTo("explore", DEFAULT_PHASES);
    state.transitionTo("tune", DEFAULT_PHASES);
    state.transitionTo("review", DEFAULT_PHASES);
    state.setWorkflowMode("flexible");

    const outcome = state.transitionTo("done", DEFAULT_PHASES);
    expect(outcome.allowed).toBe(true);
    expect(usePhaseStore.getState().currentPhase).toBe("done");
  });

  it("persists workflow mode updates", () => {
    const state = usePhaseStore.getState();
    state.setWorkflowMode("flexible");
    expect(usePhaseStore.getState().workflowMode).toBe("flexible");
    state.setWorkflowMode("strict");
    expect(usePhaseStore.getState().workflowMode).toBe("strict");
  });
});
