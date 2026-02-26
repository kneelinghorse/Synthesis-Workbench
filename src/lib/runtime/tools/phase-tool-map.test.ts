import { describe, expect, it } from "vitest";

import {
  PHASE_TOOL_MAP,
  getToolsForPhase,
  isToolAvailableInPhase,
  buildPhaseGateError,
} from "./phase-tool-map";

import { DEMO_TOOL_NAME } from "./demo-tool";
import { SIGNAL_TOOL_NAME } from "./signal-tool";
import { PHASE_TRANSITION_TOOL_NAME } from "./phase-transition-tool";
import { REVIEW_GATE_TOOL_NAME } from "./review-gate-tool";
import { TOKEN_ADJUSTMENT_TOOL_NAME } from "./token-tools";
import { LOAD_BUNDLE_TOOL_NAME } from "./stage1-tools";
import { RENDER_COMPONENT_TOOL_NAME } from "./oods-tools";
import {
  SET_DOCUMENT_TOOL_NAME,
  PATCH_NODE_TOOL_NAME,
  SET_DATA_CONTEXT_TOOL_NAME,
} from "./document-tools";
import { SAVE_TEMPLATE_TOOL_NAME } from "./template-tools";

import type { PhaseId } from "@/types/phase";

const ALL_PHASES: PhaseId[] = ["ingest", "explore", "tune", "review", "done"];

const ALWAYS_AVAILABLE_TOOLS = [
  PHASE_TRANSITION_TOOL_NAME,
  DEMO_TOOL_NAME,
  SIGNAL_TOOL_NAME,
];

describe("PHASE_TOOL_MAP", () => {
  it("covers all 5 phases", () => {
    const coveredPhases = new Set<string>();
    for (const phases of Object.values(PHASE_TOOL_MAP)) {
      for (const phase of phases) {
        coveredPhases.add(phase);
      }
    }
    expect([...coveredPhases].sort()).toEqual([...ALL_PHASES].sort());
  });

  it("maps load_bundle only to ingest", () => {
    expect(PHASE_TOOL_MAP[LOAD_BUNDLE_TOOL_NAME]).toEqual(["ingest"]);
  });

  it("maps render_component to explore and tune", () => {
    expect(PHASE_TOOL_MAP[RENDER_COMPONENT_TOOL_NAME]).toEqual([
      "explore",
      "tune",
    ]);
  });

  it("maps review_gate only to review", () => {
    expect(PHASE_TOOL_MAP[REVIEW_GATE_TOOL_NAME]).toEqual(["review"]);
  });

  it("maps update_token_state only to tune", () => {
    expect(PHASE_TOOL_MAP[TOKEN_ADJUSTMENT_TOOL_NAME]).toEqual(["tune"]);
  });

  it("maps transition_phase to all phases", () => {
    expect(PHASE_TOOL_MAP[PHASE_TRANSITION_TOOL_NAME]).toEqual(ALL_PHASES);
  });

  it("maps demo_tool to all phases", () => {
    expect(PHASE_TOOL_MAP[DEMO_TOOL_NAME]).toEqual(ALL_PHASES);
  });

  it("maps signal_tool to all phases", () => {
    expect(PHASE_TOOL_MAP[SIGNAL_TOOL_NAME]).toEqual(ALL_PHASES);
  });

  it("maps document tools to ingest, explore, and tune", () => {
    expect(PHASE_TOOL_MAP[SET_DOCUMENT_TOOL_NAME]).toEqual([
      "ingest",
      "explore",
      "tune",
    ]);
    expect(PHASE_TOOL_MAP[PATCH_NODE_TOOL_NAME]).toEqual([
      "ingest",
      "explore",
      "tune",
    ]);
    expect(PHASE_TOOL_MAP[SET_DATA_CONTEXT_TOOL_NAME]).toEqual([
      "ingest",
      "explore",
      "tune",
    ]);
    expect(PHASE_TOOL_MAP[SAVE_TEMPLATE_TOOL_NAME]).toEqual([
      "explore",
      "tune",
      "review",
      "done",
    ]);
  });
});

describe("getToolsForPhase", () => {
  it("returns correct tools for ingest phase", () => {
    const tools = getToolsForPhase("ingest");
    expect(tools).toContain(LOAD_BUNDLE_TOOL_NAME);
    expect(tools).toContain(SET_DOCUMENT_TOOL_NAME);
    expect(tools).toContain(PATCH_NODE_TOOL_NAME);
    expect(tools).toContain(SET_DATA_CONTEXT_TOOL_NAME);
    expect(tools).toContain(PHASE_TRANSITION_TOOL_NAME);
    expect(tools).toContain(DEMO_TOOL_NAME);
    expect(tools).toContain(SIGNAL_TOOL_NAME);
    expect(tools).not.toContain(RENDER_COMPONENT_TOOL_NAME);
    expect(tools).not.toContain(REVIEW_GATE_TOOL_NAME);
    expect(tools).not.toContain(TOKEN_ADJUSTMENT_TOOL_NAME);
  });

  it("returns correct tools for explore phase", () => {
    const tools = getToolsForPhase("explore");
    expect(tools).toContain(RENDER_COMPONENT_TOOL_NAME);
    expect(tools).toContain(SET_DOCUMENT_TOOL_NAME);
    expect(tools).toContain(PATCH_NODE_TOOL_NAME);
    expect(tools).toContain(SET_DATA_CONTEXT_TOOL_NAME);
    expect(tools).toContain(PHASE_TRANSITION_TOOL_NAME);
    expect(tools).not.toContain(LOAD_BUNDLE_TOOL_NAME);
    expect(tools).not.toContain(REVIEW_GATE_TOOL_NAME);
    expect(tools).not.toContain(TOKEN_ADJUSTMENT_TOOL_NAME);
  });

  it("returns correct tools for tune phase", () => {
    const tools = getToolsForPhase("tune");
    expect(tools).toContain(RENDER_COMPONENT_TOOL_NAME);
    expect(tools).toContain(TOKEN_ADJUSTMENT_TOOL_NAME);
    expect(tools).toContain(SET_DOCUMENT_TOOL_NAME);
    expect(tools).toContain(PATCH_NODE_TOOL_NAME);
    expect(tools).toContain(SET_DATA_CONTEXT_TOOL_NAME);
    expect(tools).toContain(PHASE_TRANSITION_TOOL_NAME);
    expect(tools).not.toContain(LOAD_BUNDLE_TOOL_NAME);
    expect(tools).not.toContain(REVIEW_GATE_TOOL_NAME);
  });

  it("returns correct tools for review phase", () => {
    const tools = getToolsForPhase("review");
    expect(tools).toContain(REVIEW_GATE_TOOL_NAME);
    expect(tools).toContain(SAVE_TEMPLATE_TOOL_NAME);
    expect(tools).toContain(PHASE_TRANSITION_TOOL_NAME);
    expect(tools).not.toContain(LOAD_BUNDLE_TOOL_NAME);
    expect(tools).not.toContain(RENDER_COMPONENT_TOOL_NAME);
    expect(tools).not.toContain(TOKEN_ADJUSTMENT_TOOL_NAME);
  });

  it("returns correct tools for done phase", () => {
    const tools = getToolsForPhase("done");
    expect(tools).toContain(SAVE_TEMPLATE_TOOL_NAME);
    expect(tools).toContain(PHASE_TRANSITION_TOOL_NAME);
    expect(tools).toContain(DEMO_TOOL_NAME);
    expect(tools).toContain(SIGNAL_TOOL_NAME);
    expect(tools).not.toContain(LOAD_BUNDLE_TOOL_NAME);
    expect(tools).not.toContain(RENDER_COMPONENT_TOOL_NAME);
    expect(tools).not.toContain(REVIEW_GATE_TOOL_NAME);
  });

  it("always includes transition_phase in every phase", () => {
    for (const phase of ALL_PHASES) {
      const tools = getToolsForPhase(phase);
      expect(tools).toContain(PHASE_TRANSITION_TOOL_NAME);
    }
  });
});

describe("isToolAvailableInPhase", () => {
  it("returns true for tools in their allowed phases", () => {
    expect(isToolAvailableInPhase(LOAD_BUNDLE_TOOL_NAME, "ingest")).toBe(true);
    expect(isToolAvailableInPhase(RENDER_COMPONENT_TOOL_NAME, "explore")).toBe(
      true
    );
    expect(isToolAvailableInPhase(RENDER_COMPONENT_TOOL_NAME, "tune")).toBe(
      true
    );
    expect(isToolAvailableInPhase(REVIEW_GATE_TOOL_NAME, "review")).toBe(true);
    expect(isToolAvailableInPhase(TOKEN_ADJUSTMENT_TOOL_NAME, "tune")).toBe(
      true
    );
    expect(isToolAvailableInPhase(SAVE_TEMPLATE_TOOL_NAME, "review")).toBe(
      true
    );
  });

  it("returns false for tools outside their allowed phases", () => {
    expect(isToolAvailableInPhase(LOAD_BUNDLE_TOOL_NAME, "explore")).toBe(
      false
    );
    expect(isToolAvailableInPhase(LOAD_BUNDLE_TOOL_NAME, "tune")).toBe(false);
    expect(isToolAvailableInPhase(LOAD_BUNDLE_TOOL_NAME, "review")).toBe(false);
    expect(isToolAvailableInPhase(LOAD_BUNDLE_TOOL_NAME, "done")).toBe(false);
    expect(isToolAvailableInPhase(RENDER_COMPONENT_TOOL_NAME, "ingest")).toBe(
      false
    );
    expect(isToolAvailableInPhase(REVIEW_GATE_TOOL_NAME, "ingest")).toBe(false);
    expect(isToolAvailableInPhase(TOKEN_ADJUSTMENT_TOOL_NAME, "ingest")).toBe(
      false
    );
    expect(isToolAvailableInPhase(SAVE_TEMPLATE_TOOL_NAME, "ingest")).toBe(
      false
    );
  });

  it("returns true for always-available tools in every phase", () => {
    for (const tool of ALWAYS_AVAILABLE_TOOLS) {
      for (const phase of ALL_PHASES) {
        expect(isToolAvailableInPhase(tool, phase)).toBe(true);
      }
    }
  });

  it("returns false for unrecognized tool names", () => {
    expect(isToolAvailableInPhase("unknown_tool", "ingest")).toBe(false);
  });
});

describe("buildPhaseGateError", () => {
  it("returns descriptive error for gated tool", () => {
    const error = buildPhaseGateError(LOAD_BUNDLE_TOOL_NAME, "explore");
    expect(error).toContain("load_bundle");
    expect(error).toContain("explore");
    expect(error).toContain("ingest");
  });

  it("returns error for unrecognized tool", () => {
    const error = buildPhaseGateError("unknown_tool", "ingest");
    expect(error).toContain("unknown_tool");
    expect(error).toContain("not recognized");
  });

  it("lists all allowed phases in the error message", () => {
    const error = buildPhaseGateError(RENDER_COMPONENT_TOOL_NAME, "ingest");
    expect(error).toContain("explore");
    expect(error).toContain("tune");
  });

  it("includes workflow mode details in the error message", () => {
    const error = buildPhaseGateError(RENDER_COMPONENT_TOOL_NAME, "ingest");
    expect(error).toContain('workflow mode is "strict"');
  });
});

describe("flexible workflow mode", () => {
  it("allows every known tool across all phases in flexible mode", () => {
    for (const toolName of Object.keys(PHASE_TOOL_MAP)) {
      for (const phase of ALL_PHASES) {
        expect(isToolAvailableInPhase(toolName, phase, "flexible")).toBe(true);
      }
    }
  });

  it("returns full tool set for ingest when mode is flexible", () => {
    const tools = getToolsForPhase("ingest", "flexible");
    expect(tools).toContain(LOAD_BUNDLE_TOOL_NAME);
    expect(tools).toContain(RENDER_COMPONENT_TOOL_NAME);
    expect(tools).toContain(TOKEN_ADJUSTMENT_TOOL_NAME);
    expect(tools).toContain(REVIEW_GATE_TOOL_NAME);
    expect(tools).toContain(SAVE_TEMPLATE_TOOL_NAME);
  });
});
