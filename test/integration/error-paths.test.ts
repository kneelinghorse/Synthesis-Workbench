/**
 * Error Path Integration Tests
 *
 * Tests that the system correctly handles and reports errors:
 * - Invalid schema rejected by validate
 * - Out-of-phase tool calls rejected with clear messages
 * - Missing documents, bad formats, render failures
 */

import type {
  ChatModelAdapter,
  ChatModelRunResult,
  ThreadMessage,
  ChatModelRunOptions,
} from "@assistant-ui/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Stores
import { usePhaseStore, resetPhaseState } from "@/lib/stores/phase-state";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { resetPreviewState } from "@/lib/stores/preview-state";

// Tools
import { validateSchema } from "@/lib/runtime/tools/validate-tools";
import { renderComponent } from "@/lib/runtime/tools/oods-tools";
import { executeSetDocument, executePatchNode } from "@/lib/runtime/tools/document-tools";
import { executeExportDesign } from "@/lib/runtime/tools/export-tools";
import { withToolCommands } from "@/lib/runtime/adapters/withToolCommands";
import { buildPhaseGateError } from "@/lib/runtime/tools/phase-tool-map";

// Fixtures
import { DASHBOARD_DOCUMENT, createStrictValidateClient } from "../fixtures";

// Mock MCP
vi.mock("@/lib/mcp/foundry-client", () => ({
  getFoundryMcpClient: vi.fn(),
}));
vi.mock("@/lib/persistence/design-store", () => ({
  toYAML: vi.fn(() => "mock: yaml\n"),
}));

import { getFoundryMcpClient } from "@/lib/mcp/foundry-client";

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

const createRunOptions = (messages: ThreadMessage[]): ChatModelRunOptions => ({
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

// ============================================================================
// Tests
// ============================================================================

describe("Error Paths", () => {
  beforeEach(() => {
    resetPhaseState();
    useDocumentStateStore.getState().reset();
    resetPreviewState();
  });

  describe("schema validation errors", () => {
    it("rejects schema without required component field", async () => {
      const client = createStrictValidateClient();
      (getFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

      const result = await validateSchema({
        requestId: "invalid-schema-1",
        schema: { props: { label: "Click" } },
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("component");
    });

    it("validates correct schema successfully", async () => {
      const client = createStrictValidateClient();
      (getFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

      const result = await validateSchema({
        requestId: "valid-schema",
        schema: { component: "Button", props: { label: "Click" } },
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("handles MCP connection failure gracefully", async () => {
      (getFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue({
        validate: vi.fn().mockRejectedValue(new Error("Connection refused")),
        render: vi.fn(),
        buildTokens: vi.fn(),
      });

      const result = await validateSchema({
        requestId: "conn-fail",
        schema: { component: "Button" },
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Connection refused");
    });

    it("blocks render when pre-render validation fails", async () => {
      const client = createStrictValidateClient();
      (getFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

      const result = await renderComponent({
        requestId: "validate-before-render",
        schema: { props: { label: "Click" } }, // Missing "component"
        validate: true,
      });

      expect(result.rendered).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(0);
      // Render should NOT have been called
      expect(client.render).not.toHaveBeenCalled();
    });
  });

  describe("out-of-phase tool rejection", () => {
    it("rejects /bundle in explore phase with clear error message", async () => {
      usePhaseStore.setState({ currentPhase: "explore" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);

      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("err-1", "/bundle {}")])
      );

      const text = result.content?.find((p) => p.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text") {
        expect(text.text).toContain("load_bundle");
        expect(text.text).toContain("explore");
        expect(text.text).toContain("ingest");
      }
      // Should NOT have a tool-call in the result
      expect(result.content?.find((p) => p.type === "tool-call")).toBeUndefined();
    });

    it("rejects /export in tune phase", async () => {
      usePhaseStore.setState({ currentPhase: "tune" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);

      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("err-2", "/export html")])
      );

      const text = result.content?.find((p) => p.type === "text");
      if (text?.type === "text") {
        expect(text.text).toContain("export_design");
        expect(text.text).toContain("tune");
        expect(text.text).toContain("done");
      }
    });

    it("rejects /tokens in ingest phase", async () => {
      // Default phase is ingest
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);

      const result = await runOnce(wrapped, 
        createRunOptions([
          createUserMessage("err-3", "/tokens colors.primary=#ff0000"),
        ])
      );

      const text = result.content?.find((p) => p.type === "text");
      if (text?.type === "text") {
        expect(text.text).toContain("update_token_state");
        expect(text.text).toContain("ingest");
      }
    });

    it("buildPhaseGateError produces descriptive messages", async () => {
      const msg = buildPhaseGateError("render_component", "ingest");
      expect(msg).toContain("render_component");
      expect(msg).toContain("ingest");
      expect(msg).toContain("explore");
      expect(msg).toContain("tune");
    });

    it("buildPhaseGateError handles unknown tools", async () => {
      const msg = buildPhaseGateError("unknown_tool", "ingest");
      expect(msg).toContain("unknown_tool");
      expect(msg).toContain("not recognized");
    });
  });

  describe("document tool error paths", () => {
    it("rejects set_document with no document", async () => {
      const result = await executeSetDocument({
        requestId: "no-doc",
      });

      expect(result.saved).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors![0]).toContain("No document");
    });

    it("rejects patch_node when no document is active", async () => {
      const result = executePatchNode({
        requestId: "no-active-doc",
        nodeId: "btn-1",
        props: { label: "Updated" },
      });

      expect(result.patched).toBe(false);
      expect(result.errors![0]).toContain("No active document");
    });

    it("rejects patch_node for non-existent node ID", async () => {
      await executeSetDocument({
        requestId: "setup-doc",
        document: DASHBOARD_DOCUMENT,
      });

      const result = executePatchNode({
        requestId: "bad-id",
        nodeId: "nonexistent-node",
        props: { label: "Updated" },
      });

      expect(result.patched).toBe(false);
      expect(result.errors![0]).toContain("nonexistent-node");
      expect(result.errors![0]).toContain("not found");
    });
  });

  describe("export error paths", () => {
    it("fails when no document is loaded", async () => {
      const result = executeExportDesign({
        requestId: "export-no-doc",
        format: "html",
      });

      expect(result.exported).toBe(false);
      expect(result.errors![0]).toContain("No active design document");
    });

    it("fails for unsupported format", async () => {
      await executeSetDocument({
        requestId: "export-bad-format-doc",
        document: DASHBOARD_DOCUMENT,
      });

      const result = executeExportDesign({
        requestId: "export-bad-format",
        format: "pdf" as never,
      });

      expect(result.exported).toBe(false);
      expect(result.errors![0]).toContain("Unsupported export format");
    });
  });

  describe("render error paths", () => {
    it("handles validation service failure gracefully", async () => {
      (getFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue({
        validate: vi.fn().mockRejectedValue(new Error("OODS service down")),
        render: vi.fn(),
        buildTokens: vi.fn(async () => ({ raw: null })),
      });

      const result = await renderComponent({
        requestId: "render-fail",
        schema: { component: "Button" },
        validate: true,
      });

      expect(result.rendered).toBe(false);
      expect(result.errors).toContain("OODS service down");
    });
  });
});
