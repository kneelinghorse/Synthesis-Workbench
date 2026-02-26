/**
 * Phase-Gating Integration Tests
 *
 * Verifies that tools are correctly gated per phase across the full
 * withToolCommands adapter, not just the utility functions.
 *
 * Tests every phase (ingest, explore, tune, review, done) with every
 * tool category to ensure the phase-tool-map is enforced end-to-end.
 */

import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { withToolCommands } from "@/lib/runtime/adapters/withToolCommands";
import { usePhaseStore, resetPhaseState } from "@/lib/stores/phase-state";
import {
  getToolsForPhase,
  PHASE_TOOL_MAP,
} from "@/lib/runtime/tools/phase-tool-map";
import type { PhaseId } from "@/types/phase";

// Tool names
import { LOAD_BUNDLE_TOOL_NAME } from "@/lib/runtime/tools/stage1-tools";
import { RENDER_COMPONENT_TOOL_NAME } from "@/lib/runtime/tools/oods-tools";
import { VALIDATE_SCHEMA_TOOL_NAME } from "@/lib/runtime/tools/validate-tools";
import { TOKEN_ADJUSTMENT_TOOL_NAME } from "@/lib/runtime/tools/token-tools";
import { REVIEW_GATE_TOOL_NAME } from "@/lib/runtime/tools/review-gate-tool";
import { EXPORT_DESIGN_TOOL_NAME } from "@/lib/runtime/tools/export-tools";
import {
  SET_DOCUMENT_TOOL_NAME,
  PATCH_NODE_TOOL_NAME,
  SET_DATA_CONTEXT_TOOL_NAME,
} from "@/lib/runtime/tools/document-tools";
import { DEMO_TOOL_NAME } from "@/lib/runtime/tools/demo-tool";
import { SIGNAL_TOOL_NAME } from "@/lib/runtime/tools/signal-tool";
import { PHASE_TRANSITION_TOOL_NAME } from "@/lib/runtime/tools/phase-transition-tool";

// Mock MCP clients for tools that need them
vi.mock("@/lib/mcp/foundry-client", () => ({
  getFoundryMcpClient: vi.fn(() => ({
    render: vi.fn(async () => ({ html: "<div>mock</div>", warnings: [], raw: {} })),
    validate: vi.fn(async () => ({ valid: true, errors: [], warnings: [], raw: null })),
    buildTokens: vi.fn(async () => ({ raw: null })),
  })),
}));

// ============================================================================
// Helpers
// ============================================================================

const createUserMessage = (id: string, text: string): ThreadMessage => ({
  id,
  createdAt: new Date(),
  role: "user",
  content: [{ type: "text", text }],
  attachments: [],
  metadata: { custom: {} },
});

const createRunOptions = (
  messages: ThreadMessage[]
): ChatModelRunOptions => ({
  messages,
  runConfig: {},
  abortSignal: new AbortController().signal,
  context: {},
  config: {},
  unstable_getMessage: () => messages[messages.length - 1],
});

const runOnce = async (
  adapter: ChatModelAdapter,
  runOptions: ChatModelRunOptions
): Promise<ChatModelRunResult> => {
  const runResult = adapter.run(runOptions);
  if (
    typeof runResult === "object" &&
    runResult !== null &&
    Symbol.asyncIterator in runResult
  ) {
    const update = await (
      runResult as AsyncGenerator<ChatModelRunResult, void>
    ).next();
    if (update.done || !update.value) {
      throw new Error("Expected at least one run result update.");
    }
    return update.value;
  }

  return await runResult;
};

const createAdapter = (): ChatModelAdapter => ({
  run: vi.fn(async () => ({
    content: [{ type: "text", text: "fallback" }],
    status: { type: "complete", reason: "stop" },
  })),
});

/** All phases in pipeline order */
const ALL_PHASES: PhaseId[] = ["ingest", "explore", "tune", "review", "done"];

/** Phase-specific tools mapped to their slash commands */
const PHASE_SPECIFIC_TOOLS = [
  { trigger: "/bundle {}", tool: LOAD_BUNDLE_TOOL_NAME, phases: ["ingest"] },
  { trigger: '/render {"component":"Button"}', tool: RENDER_COMPONENT_TOOL_NAME, phases: ["explore", "tune"] },
  { trigger: '/validate {"component":"Button"}', tool: VALIDATE_SCHEMA_TOOL_NAME, phases: ["explore", "tune"] },
  { trigger: "/tokens colors.primary=#000", tool: TOKEN_ADJUSTMENT_TOOL_NAME, phases: ["tune"] },
  { trigger: "/review approve", tool: REVIEW_GATE_TOOL_NAME, phases: ["review"] },
  { trigger: "/export html", tool: EXPORT_DESIGN_TOOL_NAME, phases: ["done"] },
] as const;

/** Always-available tools */
const ALWAYS_AVAILABLE_TOOLS = [
  { trigger: "/tool test", tool: DEMO_TOOL_NAME },
  { trigger: "/signal check", tool: SIGNAL_TOOL_NAME },
  { trigger: "/phase explore", tool: PHASE_TRANSITION_TOOL_NAME },
] as const;

// ============================================================================
// Tests
// ============================================================================

describe("Phase-Gating Integration", () => {
  beforeEach(() => {
    resetPhaseState();
  });

  describe("getToolsForPhase returns correct tool sets", () => {
    it("ingest phase has bundle loading and always-available tools", () => {
      const tools = getToolsForPhase("ingest");
      expect(tools).toContain(LOAD_BUNDLE_TOOL_NAME);
      expect(tools).toContain(DEMO_TOOL_NAME);
      expect(tools).toContain(SIGNAL_TOOL_NAME);
      expect(tools).toContain(PHASE_TRANSITION_TOOL_NAME);
      expect(tools).not.toContain(RENDER_COMPONENT_TOOL_NAME);
      expect(tools).not.toContain(EXPORT_DESIGN_TOOL_NAME);
    });

    it("explore phase has render, validate, document tools", () => {
      const tools = getToolsForPhase("explore");
      expect(tools).toContain(RENDER_COMPONENT_TOOL_NAME);
      expect(tools).toContain(VALIDATE_SCHEMA_TOOL_NAME);
      expect(tools).toContain(SET_DOCUMENT_TOOL_NAME);
      expect(tools).toContain(PATCH_NODE_TOOL_NAME);
      expect(tools).toContain(SET_DATA_CONTEXT_TOOL_NAME);
      expect(tools).not.toContain(LOAD_BUNDLE_TOOL_NAME);
      expect(tools).not.toContain(TOKEN_ADJUSTMENT_TOOL_NAME);
    });

    it("tune phase adds token adjustment to explore tools", () => {
      const tools = getToolsForPhase("tune");
      expect(tools).toContain(TOKEN_ADJUSTMENT_TOOL_NAME);
      expect(tools).toContain(RENDER_COMPONENT_TOOL_NAME);
      expect(tools).toContain(SET_DOCUMENT_TOOL_NAME);
      expect(tools).not.toContain(LOAD_BUNDLE_TOOL_NAME);
    });

    it("review phase has only review gate and always-available", () => {
      const tools = getToolsForPhase("review");
      expect(tools).toContain(REVIEW_GATE_TOOL_NAME);
      expect(tools).toContain(PHASE_TRANSITION_TOOL_NAME);
      expect(tools).not.toContain(RENDER_COMPONENT_TOOL_NAME);
      expect(tools).not.toContain(TOKEN_ADJUSTMENT_TOOL_NAME);
    });

    it("done phase has only export and always-available", () => {
      const tools = getToolsForPhase("done");
      expect(tools).toContain(EXPORT_DESIGN_TOOL_NAME);
      expect(tools).toContain(PHASE_TRANSITION_TOOL_NAME);
      expect(tools).not.toContain(RENDER_COMPONENT_TOOL_NAME);
      expect(tools).not.toContain(REVIEW_GATE_TOOL_NAME);
    });
  });

  describe("slash commands are gated through withToolCommands", () => {
    for (const { trigger, tool, phases } of PHASE_SPECIFIC_TOOLS) {
      const blockedPhases = ALL_PHASES.filter((p) => !phases.includes(p));

      for (const allowedPhase of phases) {
        it(`allows ${trigger.split(" ")[0]} in ${allowedPhase} phase`, async () => {
          usePhaseStore.setState({ currentPhase: allowedPhase });
          const adapter = createAdapter();
          const wrapped = withToolCommands(adapter);
          const result = await runOnce(wrapped, 
            createRunOptions([createUserMessage(`u-${tool}-${allowedPhase}`, trigger)])
          );

          const toolCall = result.content?.find((p) => p.type === "tool-call");
          expect(toolCall).toBeDefined();
          if (toolCall?.type === "tool-call") {
            expect(toolCall.toolName).toBe(tool);
          }
        });
      }

      for (const blockedPhase of blockedPhases) {
        it(`blocks ${trigger.split(" ")[0]} in ${blockedPhase} phase`, async () => {
          usePhaseStore.setState({ currentPhase: blockedPhase });
          const adapter = createAdapter();
          const wrapped = withToolCommands(adapter);
          const result = await runOnce(wrapped, 
            createRunOptions([createUserMessage(`u-${tool}-${blockedPhase}`, trigger)])
          );

          // Should return text error, not tool-call
          const toolCall = result.content?.find((p) => p.type === "tool-call");
          expect(toolCall).toBeUndefined();

          const text = result.content?.find((p) => p.type === "text");
          expect(text?.type).toBe("text");
          if (text?.type === "text") {
            expect(text.text).toContain(tool);
            expect(text.text).toContain(blockedPhase);
          }
        });
      }
    }
  });

  describe("always-available tools work in every phase", () => {
    for (const { trigger, tool } of ALWAYS_AVAILABLE_TOOLS) {
      for (const phase of ALL_PHASES) {
        it(`allows ${trigger.split(" ")[0]} in ${phase} phase`, async () => {
          usePhaseStore.setState({ currentPhase: phase });
          const adapter = createAdapter();
          const wrapped = withToolCommands(adapter);
          const result = await runOnce(wrapped, 
            createRunOptions([createUserMessage(`u-always-${tool}-${phase}`, trigger)])
          );

          const toolCall = result.content?.find((p) => p.type === "tool-call");
          expect(toolCall).toBeDefined();
          if (toolCall?.type === "tool-call") {
            expect(toolCall.toolName).toBe(tool);
          }
        });
      }
    }
  });

  describe("executeTool phase gating", () => {
    it("blocks render_component via executeTool in ingest phase", async () => {
      // Default phase is ingest
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await wrapped.executeTool!({
        toolName: RENDER_COMPONENT_TOOL_NAME,
        args: { requestId: "test", schema: {} },
        toolCallId: "tc-gate-1",
        abortSignal: new AbortController().signal,
      });

      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("render_component");
    });

    it("allows render_component via executeTool in explore phase", async () => {
      usePhaseStore.setState({ currentPhase: "explore" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await wrapped.executeTool!({
        toolName: RENDER_COMPONENT_TOOL_NAME,
        args: { requestId: "test", schema: { component: "Button" } },
        toolCallId: "tc-gate-2",
        abortSignal: new AbortController().signal,
      });

      expect(result).toHaveProperty("rendered");
      expect((result as { rendered: boolean }).rendered).toBe(true);
    });

    it("blocks export_design via executeTool in explore phase", async () => {
      usePhaseStore.setState({ currentPhase: "explore" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await wrapped.executeTool!({
        toolName: EXPORT_DESIGN_TOOL_NAME,
        args: { requestId: "test", format: "html" },
        toolCallId: "tc-gate-3",
        abortSignal: new AbortController().signal,
      });

      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("export_design");
    });
  });

  describe("PHASE_TOOL_MAP completeness", () => {
    it("every registered tool has at least one allowed phase", () => {
      for (const [toolName, phases] of Object.entries(PHASE_TOOL_MAP)) {
        expect(phases.length).toBeGreaterThan(0);
      }
    });

    it("every phase has at least the always-available tools", () => {
      for (const phase of ALL_PHASES) {
        const tools = getToolsForPhase(phase);
        expect(tools).toContain(PHASE_TRANSITION_TOOL_NAME);
        expect(tools).toContain(DEMO_TOOL_NAME);
        expect(tools).toContain(SIGNAL_TOOL_NAME);
      }
    });
  });
});
