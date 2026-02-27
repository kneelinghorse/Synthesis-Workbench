import type { PhaseId } from "@/types/phase";
import type { WorkflowMode } from "@/lib/stores/phase-state";

import { DEMO_TOOL_NAME } from "./demo-tool";
import { SIGNAL_TOOL_NAME } from "./signal-tool";
import { PHASE_TRANSITION_TOOL_NAME } from "./phase-transition-tool";
import { REVIEW_GATE_TOOL_NAME } from "./review-gate-tool";
import { TOKEN_ADJUSTMENT_TOOL_NAME } from "./token-tools";
import {
  LOAD_BUNDLE_TOOL_NAME,
  INSPECT_APP_TOOL_NAME,
  INSPECT_SURFACE_TOOL_NAME,
} from "./stage1-tools";
import { RENDER_COMPONENT_TOOL_NAME } from "./oods-tools";
import { VALIDATE_SCHEMA_TOOL_NAME } from "./validate-tools";
import {
  SET_DOCUMENT_TOOL_NAME,
  PATCH_NODE_TOOL_NAME,
  SET_DATA_CONTEXT_TOOL_NAME,
} from "./document-tools";
import { EXPORT_DESIGN_TOOL_NAME } from "./export-tools";
import { SAVE_TEMPLATE_TOOL_NAME } from "./template-tools";
import { COMPONENT_CATALOG_TOOL_NAME } from "./component-catalog-tool";

/** All phase IDs for validation */
const ALL_PHASES: readonly PhaseId[] = [
  "ingest",
  "explore",
  "tune",
  "review",
  "done",
];

/**
 * Strict mode tool map keeps explicit workflow guardrails.
 */
export const PHASE_TOOL_MAP: Record<string, readonly PhaseId[]> = {
  // Always available
  [PHASE_TRANSITION_TOOL_NAME]: ["ingest", "explore", "tune", "review", "done"],
  [DEMO_TOOL_NAME]: ["ingest", "explore", "tune", "review", "done"],
  [SIGNAL_TOOL_NAME]: ["ingest", "explore", "tune", "review", "done"],
  [COMPONENT_CATALOG_TOOL_NAME]: [
    "ingest",
    "explore",
    "tune",
    "review",
    "done",
  ],

  // Ingest phase
  [LOAD_BUNDLE_TOOL_NAME]: ["ingest"],
  [INSPECT_APP_TOOL_NAME]: ["ingest"],
  [INSPECT_SURFACE_TOOL_NAME]: ["ingest"],

  // Explore + Tune phases
  [RENDER_COMPONENT_TOOL_NAME]: ["explore", "tune"],
  [VALIDATE_SCHEMA_TOOL_NAME]: ["explore", "tune"],
  // Document authoring is allowed in ingest so users can start from templates
  // before loading a Stage1 bundle.
  [SET_DOCUMENT_TOOL_NAME]: ["ingest", "explore", "tune"],
  [PATCH_NODE_TOOL_NAME]: ["ingest", "explore", "tune"],
  [SET_DATA_CONTEXT_TOOL_NAME]: ["ingest", "explore", "tune"],
  [SAVE_TEMPLATE_TOOL_NAME]: ["explore", "tune", "review", "done"],

  // Tune phase
  [TOKEN_ADJUSTMENT_TOOL_NAME]: ["tune"],

  // Review phase
  [REVIEW_GATE_TOOL_NAME]: ["review"],

  // Done phase
  [EXPORT_DESIGN_TOOL_NAME]: ["done"],
} as const;

/**
 * Flexible mode reduces friction discovered in Sprint 7-13 usage:
 * once users understand the workflow, tool gating should not block iteration loops.
 */
const FLEXIBLE_PHASE_TOOL_MAP: Record<string, readonly PhaseId[]> =
  Object.fromEntries(
    Object.keys(PHASE_TOOL_MAP).map((toolName) => [toolName, ALL_PHASES])
  );

const resolveToolMap = (mode: WorkflowMode) =>
  mode === "flexible" ? FLEXIBLE_PHASE_TOOL_MAP : PHASE_TOOL_MAP;

/**
 * Returns the set of tool names available in a given phase.
 */
export function getToolsForPhase(
  phase: PhaseId,
  mode: WorkflowMode = "strict"
): string[] {
  return Object.entries(resolveToolMap(mode))
    .filter(([, phases]) => phases.includes(phase))
    .map(([toolName]) => toolName);
}

/**
 * Checks whether a specific tool is available in a given phase.
 */
export function isToolAvailableInPhase(
  toolName: string,
  phase: PhaseId,
  mode: WorkflowMode = "strict"
): boolean {
  const allowedPhases = resolveToolMap(mode)[toolName];
  if (!allowedPhases) return false;
  return allowedPhases.includes(phase);
}

/**
 * Returns a descriptive error message when a tool is called outside its allowed phase.
 */
export function buildPhaseGateError(
  toolName: string,
  currentPhase: PhaseId,
  mode: WorkflowMode = "strict"
): string {
  const allowedPhases = resolveToolMap(mode)[toolName];
  if (!allowedPhases) {
    return `Tool "${toolName}" is not recognized in the phase-gated tool system.`;
  }
  const phaseList = allowedPhases.join(", ");
  return `Tool "${toolName}" is not available in the "${currentPhase}" phase while workflow mode is "${mode}". It can be used in: ${phaseList}.`;
}
