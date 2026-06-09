import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withToolCommands } from "./withToolCommands";
import { LOAD_BUNDLE_TOOL_NAME } from "@/lib/runtime/tools/stage1-tools";
import { TOKEN_ADJUSTMENT_TOOL_NAME } from "@/lib/runtime/tools/token-tools";
import { FOUNDRY_TOKEN_SYNC_TOOL_NAME } from "@/lib/runtime/tools/foundry-token-sync-tool";
import { RENDER_COMPONENT_TOOL_NAME } from "@/lib/runtime/tools/oods-tools";
import { VALIDATE_SCHEMA_TOOL_NAME } from "@/lib/runtime/tools/validate-tools";
import { SET_DATA_CONTEXT_TOOL_NAME } from "@/lib/runtime/tools/document-tools";
import { COMPONENT_CATALOG_TOOL_NAME } from "@/lib/runtime/tools/component-catalog-tool";
import { useProjectStateStore } from "@/lib/stores/project-state";
import * as catalogModule from "@/lib/foundry/catalog";

const createUserMessage = (id: string, text: string): ThreadMessage => ({
  id,
  createdAt: new Date(),
  role: "user",
  content: [{ type: "text", text }],
  attachments: [],
  metadata: {
    custom: {},
  },
});

const createAssistantToolMessage = (
  id: string,
  toolName: string,
  result: unknown,
  slashCommand = false
): ThreadMessage => ({
  id,
  createdAt: new Date(),
  role: "assistant",
  content: [
    {
      type: "tool-call",
      toolCallId: slashCommand
        ? `slash:${toolName}-${id}`
        : `${toolName}-${id}`,
      toolName,
      args: {},
      argsText: "{}",
      result,
    },
  ],
  status: {
    type: "complete",
    reason: "stop",
  },
  metadata: {
    unstable_state: null,
    unstable_annotations: [],
    unstable_data: [],
    steps: [],
    custom: {},
  },
});

const createRunOptions = (
  messages: ThreadMessage[],
  currentMessage: ThreadMessage = messages[messages.length - 1]
): ChatModelRunOptions => ({
  messages,
  runConfig: {},
  abortSignal: new AbortController().signal,
  context: {},
  config: {},
  unstable_getMessage: () => currentMessage,
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

const collectRunUpdates = async (
  adapter: ChatModelAdapter,
  runOptions: ChatModelRunOptions
): Promise<ChatModelRunResult[]> => {
  const runResult = adapter.run(runOptions);
  if (
    typeof runResult === "object" &&
    runResult !== null &&
    Symbol.asyncIterator in runResult
  ) {
    const updates: ChatModelRunResult[] = [];
    for await (const update of runResult as AsyncGenerator<ChatModelRunResult, void>) {
      updates.push(update);
    }
    return updates;
  }

  return [await runResult];
};

const createAdapter = () => {
  const run: ChatModelAdapter["run"] = vi.fn(
    async (): Promise<ChatModelRunResult> => ({
      content: [{ type: "text", text: "fallback" }],
      status: { type: "complete", reason: "stop" },
    })
  );
  return { run };
};

describe("withToolCommands", () => {
  beforeEach(() => {
    useProjectStateStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delegates free-text prompts as streamed adapter updates", async () => {
    const adapter = {
      run: vi.fn(async function* (): AsyncGenerator<
        ChatModelRunResult,
        void
      > {
        yield {
          content: [{ type: "text", text: "partial response" }],
          status: { type: "incomplete", reason: "cancelled" as const },
        };
        yield {
          content: [{ type: "text", text: "final response" }],
          status: { type: "complete", reason: "stop" as const },
        };
      }),
    } satisfies ChatModelAdapter;
    const wrapped = withToolCommands(adapter);

    const updates = await collectRunUpdates(
      wrapped,
      createRunOptions([createUserMessage("u-stream-1", "hello runtime")])
    );

    expect(adapter.run).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(2);
    expect(updates[0].status).toMatchObject({ type: "incomplete" });
    expect(updates[1].status).toMatchObject({ type: "complete", reason: "stop" });
  });

  it("returns a token tool call when /tokens is requested", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([
        createUserMessage("u-5", "/tokens colors.primary=#111111"),
      ])
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a token tool call.");
    }
    expect(toolCall.toolName).toBe(TOKEN_ADJUSTMENT_TOOL_NAME);
    expect(toolCall.args).toMatchObject({
      changes: {
        "colors.primary": "#111111",
      },
    });
    expect(result.status).toMatchObject({ type: "requires-action" });
  });

  it("returns a Foundry token sync tool call when /tokens import is requested", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([
        createUserMessage("u-5b", "/tokens import {\"theme\":\"dark\"}"),
      ])
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a Foundry token sync tool call.");
    }
    expect(toolCall.toolName).toBe(FOUNDRY_TOKEN_SYNC_TOOL_NAME);
    expect(result.status).toMatchObject({ type: "requires-action" });
  });

  it("returns a stage1 bundle tool call when /bundle is requested", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([
        createUserMessage("u-6", "/bundle {\"manifest\":{\"contractVersion\":\"1.0.0\"}}"),
      ])
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a stage1 bundle tool call.");
    }
    expect(toolCall.toolName).toBe(LOAD_BUNDLE_TOOL_NAME);
    expect(result.status).toMatchObject({ type: "requires-action" });
  });

  it("returns a render tool call when /render is requested", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([
        createUserMessage("u-7", "/render {\"type\":\"component\"}"),
      ])
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a render tool call.");
    }
    expect(toolCall.toolName).toBe(RENDER_COMPONENT_TOOL_NAME);
    expect(result.status).toMatchObject({ type: "requires-action" });
  });

  it("returns a validate tool call when /validate is requested", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([
        createUserMessage("u-8", '/validate {"component":"Button"}'),
      ])
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a validate tool call.");
    }
    expect(toolCall.toolName).toBe(VALIDATE_SCHEMA_TOOL_NAME);
    expect(result.status).toMatchObject({ type: "requires-action" });
  });

  it("returns a component catalog tool call when /components is requested", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-components-1", "/components")])
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a component catalog tool call.");
    }
    expect(toolCall.toolName).toBe(COMPONENT_CATALOG_TOOL_NAME);
    expect(toolCall.args).toMatchObject({
      componentCount: expect.any(Number),
      source: expect.stringMatching(/foundry|fallback/),
    });
  });

  it("prefers Foundry catalog data for /components when available", async () => {
    const catalogSpy = vi
      .spyOn(catalogModule, "getComponentCatalogPromptSection")
      .mockResolvedValue({
        prompt: "catalog prompt",
        snapshot: {
          source: "foundry",
          fromCache: false,
          fetchedAt: "2026-01-01T00:00:00.000Z",
          catalog: {
            etag: "foundry-etag",
            generatedAt: "2026-01-01T00:00:00.000Z",
            schemaValidated: true,
            componentCount: 2,
            components: [
              {
                id: "Button",
                name: "Button",
                description: "Button",
                categories: [],
                tags: [],
                variants: [],
                traits: [],
                requiredProps: ["label"],
                traitUsages: [],
              },
            ],
          },
        },
      });

    try {
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(
        wrapped,
        createRunOptions([createUserMessage("u-components-foundry", "/components")])
      );

      const toolCall = result.content?.find((part) => part.type === "tool-call");
      if (!toolCall || toolCall.type !== "tool-call") {
        throw new Error("Expected a component catalog tool call.");
      }
      expect(toolCall.toolName).toBe(COMPONENT_CATALOG_TOOL_NAME);
      expect(toolCall.args).toMatchObject({
        source: "foundry",
        componentCount: 2,
      });
    } finally {
      catalogSpy.mockRestore();
    }
  });

  it("falls back to static catalog metadata for /components when Foundry is unavailable", async () => {
    const catalogSpy = vi
      .spyOn(catalogModule, "getComponentCatalogPromptSection")
      .mockResolvedValue({
        prompt: "fallback prompt",
        snapshot: {
          source: "fallback",
          fromCache: false,
          fetchedAt: "2026-01-01T00:00:00.000Z",
          catalog: {
            etag: "fallback-etag",
            generatedAt: "2026-01-01T00:00:00.000Z",
            schemaValidated: true,
            componentCount: 4,
            components: [
              {
                id: "Text",
                name: "Text",
                description: "Fallback text",
                categories: ["fallback"],
                tags: ["offline"],
                variants: [],
                traits: ["Typography"],
                requiredProps: ["content"],
                traitUsages: [],
              },
            ],
          },
        },
      });

    try {
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(
        wrapped,
        createRunOptions([createUserMessage("u-components-fallback", "/components")])
      );

      const toolCall = result.content?.find((part) => part.type === "tool-call");
      if (!toolCall || toolCall.type !== "tool-call") {
        throw new Error("Expected a component catalog tool call.");
      }
      expect(toolCall.toolName).toBe(COMPONENT_CATALOG_TOOL_NAME);
      expect(toolCall.args).toMatchObject({
        source: "fallback",
        componentCount: 4,
      });
    } finally {
      catalogSpy.mockRestore();
    }
  });

  it("injects component catalog context into system prompt", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter, {
      systemPromptOverride: "Base runtime prompt.",
    });

    await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-prompt-catalog-1", "hello runtime")])
    );

    expect(adapter.run).toHaveBeenCalledTimes(1);
    const calledRunOptions = (adapter.run as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      messages: ThreadMessage[];
    };
    const systemMessage = calledRunOptions.messages.find(
      (message) => message.role === "system"
    );
    expect(systemMessage?.content[0]?.type).toBe("text");
    if (systemMessage?.content[0]?.type === "text") {
      expect(systemMessage.content[0].text).toContain("Base runtime prompt.");
      expect(systemMessage.content[0].text).toContain("OODS COMPONENT CATALOG");
    }
  });

  it("delegates assistant tool results for non-slash prompts", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage(
      "a-nonslash-tool-result",
      VALIDATE_SCHEMA_TOOL_NAME,
      {
        valid: true,
        errors: [],
        warnings: [],
        resolvedAt: "2025-01-01T00:00:00.000Z",
      }
    );

    const result = await runOnce(
      wrapped,
      createRunOptions(
        [createUserMessage("u-nonslash-1", "Check the previous result"), assistantMessage],
        assistantMessage
      )
    );

    expect(adapter.run).toHaveBeenCalledTimes(1);
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: "fallback",
    });
  });

  it("summarizes validate schema results (valid)", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage(
      "a-validate-1",
      VALIDATE_SCHEMA_TOOL_NAME,
      {
        valid: true,
        errors: [],
        warnings: [],
        resolvedAt: "2025-01-01T00:00:00.000Z",
      },
      true
    );

    const result = await runOnce(wrapped,
      createRunOptions([assistantMessage], assistantMessage)
    );

    expect(adapter.run).not.toHaveBeenCalled();
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: "Schema validation passed.",
    });
  });

  it("summarizes validate schema results (invalid)", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage(
      "a-validate-2",
      VALIDATE_SCHEMA_TOOL_NAME,
      {
        valid: false,
        errors: ["Missing component field"],
        warnings: ["Deprecated prop"],
        resolvedAt: "2025-01-01T00:00:00.000Z",
      },
      true
    );

    const result = await runOnce(wrapped,
      createRunOptions([assistantMessage], assistantMessage)
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const text = result.content?.[0];
    expect(text?.type).toBe("text");
    if (text?.type === "text") {
      expect(text.text).toContain("Schema validation failed");
      expect(text.text).toContain("Missing component field");
      expect(text.text).toContain("1 warning");
    }
  });

  it("summarizes token adjustment tool results", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage(
      "a-5",
      TOKEN_ADJUSTMENT_TOOL_NAME,
      {
        applied: true,
        appliedCount: 2,
        invalidPaths: [],
        resolvedAt: "2025-01-01T00:00:00.000Z",
      },
      true
    );

    const result = await runOnce(wrapped,
      createRunOptions([assistantMessage], assistantMessage)
    );

    expect(adapter.run).not.toHaveBeenCalled();
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: "Token update applied: 2 changes.",
    });
  });

  it("summarizes Foundry token sync tool results", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage(
      "a-5b",
      FOUNDRY_TOKEN_SYNC_TOOL_NAME,
      {
        synced: true,
        importedCount: 8,
        appliedCount: 6,
        preservedOverrideCount: 2,
        overriddenCount: 2,
        invalidPaths: [],
        unmappedFoundryPaths: [],
        entries: [],
        resolvedAt: "2025-01-01T00:00:00.000Z",
      },
      true
    );

    const result = await runOnce(wrapped,
      createRunOptions([assistantMessage], assistantMessage)
    );

    expect(adapter.run).not.toHaveBeenCalled();
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: "Foundry canonical sync applied: 6 tokens. Preserved 2 manual overrides.",
    });
  });

  it("summarizes stage1 bundle tool results", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage(
      "a-6",
      LOAD_BUNDLE_TOOL_NAME,
      {
        loaded: true,
        componentCount: 4,
        tokenSuggestionCount: 6,
        resolvedAt: "2025-01-01T00:00:00.000Z",
      },
      true
    );

    const result = await runOnce(wrapped,
      createRunOptions([assistantMessage], assistantMessage)
    );

    expect(adapter.run).not.toHaveBeenCalled();
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: "Stage1 bundle loaded: 4 components, 6 token suggestions.",
    });
  });

  it("summarizes render tool results", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage(
      "a-7",
      RENDER_COMPONENT_TOOL_NAME,
      {
        rendered: true,
        html: "<div />",
        resolvedAt: "2025-01-01T00:00:00.000Z",
      },
      true
    );

    const result = await runOnce(wrapped,
      createRunOptions([assistantMessage], assistantMessage)
    );

    expect(adapter.run).not.toHaveBeenCalled();
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: "Component document applied. Preview rendering.",
    });
  });

  it("summarizes set_data_context tool results (slash-triggered)", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage(
      "a-data-context-1",
      SET_DATA_CONTEXT_TOOL_NAME,
      {
        updated: true,
        keyCount: 2,
        resolvedAt: "2025-01-01T00:00:00.000Z",
      },
      true
    );

    const result = await runOnce(
      wrapped,
      createRunOptions([assistantMessage], assistantMessage)
    );

    expect(adapter.run).not.toHaveBeenCalled();
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: "Data context updated: 2 keys. Bindings will resolve on next render.",
    });
  });

  it("delegates LLM-initiated tool results back to LLM (no interception)", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    // LLM-initiated tool call — no slash: prefix → should NOT be intercepted
    const assistantMessage = createAssistantToolMessage(
      "a-llm-chain",
      SET_DATA_CONTEXT_TOOL_NAME,
      {
        updated: true,
        keyCount: 3,
        resolvedAt: "2025-01-01T00:00:00.000Z",
      }
    );

    const result = await runOnce(
      wrapped,
      createRunOptions([assistantMessage], assistantMessage)
    );

    expect(adapter.run).toHaveBeenCalledTimes(1);
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: "fallback",
    });
  });
});
