import type { ChatModelAdapter } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";

import { PRIMITIVE_PROP_GUIDANCE } from "@/lib/foundry/catalog";
import { withToolCommands } from "@/lib/runtime/adapters/withToolCommands";
import { getAnthropicToolDefinitions } from "@/lib/runtime/tools/tool-definitions";
import { FORGE_REGENERATE_TOOL_NAME } from "./forge-regenerate-tools";

// ============================================================================
// s21-m04 wiring — the agent-facing contract for the Option B regenerate path.
// ============================================================================

describe("forge_regenerate tool definition", () => {
  const definition = getAnthropicToolDefinitions().find(
    (tool) => tool.name === FORGE_REGENERATE_TOOL_NAME,
  );

  it("is exposed to the agent with intent + REQUIRED addressesCommentIds", () => {
    // addressesCommentIds is optional on set_document but REQUIRED here: a
    // full regenerate has no target nodeId for the auto-match safety net, so
    // the declared ids are the ONLY linkage that resolves pinned comments —
    // without them the s20-m10 endless-re-propose backstop is lost.
    expect(definition).toBeDefined();
    expect(definition!.input_schema.required).toEqual(
      expect.arrayContaining(["requestId", "intent", "addressesCommentIds"]),
    );
    expect(definition!.input_schema.properties).toHaveProperty("intent");
    expect(definition!.input_schema.properties).toHaveProperty("layout");
  });

  it("description carries the m03 prompt plan: prop contract + seed-once framing + durable anchors", () => {
    // m09 regression guard: without the prop contract the agent invents props
    // (content/variant) that Forge silently drops, rendering empty shells.
    expect(definition!.description).toContain(PRIMITIVE_PROP_GUIDANCE);
    // Derek's confirmed shape: design_compose is the SEED, iteration is local.
    expect(definition!.description).toMatch(/patch_node/);
    expect(definition!.description).toMatch(/do NOT recompose/i);
    // Critique anchors on the durable label, not the re-minted node id.
    expect(definition!.description).toMatch(/data-oods-label/);
  });
});

describe("forge_regenerate dispatcher guard", () => {
  it("cannot be auto-executed — only the suggest-and-confirm UI applies it", async () => {
    // The whole confirm gate (decision 117) hangs on this: if the dispatcher
    // ever executed the tool directly, a regenerate would replace the document
    // without a human Accept.
    const adapter = {
      run: vi.fn(),
      executeTool: vi.fn(),
    } as unknown as ChatModelAdapter;
    const wrapped = withToolCommands(adapter);

    const result = await wrapped.executeTool!({
      toolName: FORGE_REGENERATE_TOOL_NAME,
      args: { requestId: "r-1", intent: "anything", addressesCommentIds: [] },
      toolCallId: "tc-1",
      abortSignal: new AbortController().signal,
    });

    expect(result).toEqual({
      error: expect.stringContaining("suggest-and-confirm"),
    });
    // It must never fall through to the wrapped adapter either.
    expect(
      (adapter as unknown as { executeTool: ReturnType<typeof vi.fn> })
        .executeTool,
    ).not.toHaveBeenCalled();
  });
});
