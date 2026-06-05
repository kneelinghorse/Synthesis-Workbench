import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withToolCommands } from "./withToolCommands";
import { DEMO_TOOL_NAME } from "@/lib/runtime/tools/demo-tool";
import { PHASE_TRANSITION_TOOL_NAME } from "@/lib/runtime/tools/phase-transition-tool";
import { REVIEW_GATE_TOOL_NAME } from "@/lib/runtime/tools/review-gate-tool";
import { SIGNAL_TOOL_NAME } from "@/lib/runtime/tools/signal-tool";
import { LOAD_BUNDLE_TOOL_NAME } from "@/lib/runtime/tools/stage1-tools";
import { TOKEN_ADJUSTMENT_TOOL_NAME } from "@/lib/runtime/tools/token-tools";
import { FOUNDRY_TOKEN_SYNC_TOOL_NAME } from "@/lib/runtime/tools/foundry-token-sync-tool";
import { RENDER_COMPONENT_TOOL_NAME } from "@/lib/runtime/tools/oods-tools";
import { VALIDATE_SCHEMA_TOOL_NAME } from "@/lib/runtime/tools/validate-tools";
import {
  SET_DOCUMENT_TOOL_NAME,
  SET_DATA_CONTEXT_TOOL_NAME,
} from "@/lib/runtime/tools/document-tools";
import { EXPORT_DESIGN_TOOL_NAME } from "@/lib/runtime/tools/export-tools";
import { SAVE_TEMPLATE_TOOL_NAME } from "@/lib/runtime/tools/template-tools";
import { COMPONENT_CATALOG_TOOL_NAME } from "@/lib/runtime/tools/component-catalog-tool";
import { usePhaseStore, resetPhaseState } from "@/lib/stores/phase-state";
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
  metadata: {
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
  const run: ChatModelAdapter["run"] = vi.fn(async () => ({
    content: [{ type: "text", text: "fallback" }],
    status: { type: "complete", reason: "stop" },
  }));
  return { run };
};

describe("withToolCommands", () => {
  beforeEach(() => {
    resetPhaseState();
    useProjectStateStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a demo tool call when /tool is requested", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-1", "/tool confirm wiring")])
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a demo tool call.");
    }
    expect(toolCall.toolName).toBe(DEMO_TOOL_NAME);
    expect(result.status).toMatchObject({ type: "requires-action" });
  });

  it("delegates free-text prompts as streamed adapter updates", async () => {
    const adapter = {
      run: vi.fn(async function* () {
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

  it("returns a signal tool call when /signal is requested", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-2", "/signal status check")])
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a signal tool call.");
    }
    expect(toolCall.toolName).toBe(SIGNAL_TOOL_NAME);
    expect(result.status).toMatchObject({ type: "requires-action" });
  });

  it("returns a phase tool call when /phase is requested", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-3", "/phase go to explore")])
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a phase tool call.");
    }
    expect(toolCall.toolName).toBe(PHASE_TRANSITION_TOOL_NAME);
    expect(result.status).toMatchObject({ type: "requires-action" });
  });

  it("returns a review gate tool call when /review is requested", async () => {
    usePhaseStore.setState({ currentPhase: "review" });
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-4", "/review approve this")])
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a review gate tool call.");
    }
    expect(toolCall.toolName).toBe(REVIEW_GATE_TOOL_NAME);
    expect(result.status).toMatchObject({ type: "requires-action" });
  });

  it("returns a token tool call when /tokens is requested", async () => {
    usePhaseStore.setState({ currentPhase: "tune" });
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
    usePhaseStore.setState({ currentPhase: "tune" });
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
    usePhaseStore.setState({ currentPhase: "explore" });
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
    usePhaseStore.setState({ currentPhase: "explore" });
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

  it("returns a set_document tool call when /doc template is requested", async () => {
    usePhaseStore.setState({ currentPhase: "explore" });
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([
        createUserMessage("u-doc-template-1", "/doc template dashboard"),
      ])
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a set_document tool call.");
    }
    expect(toolCall.toolName).toBe(SET_DOCUMENT_TOOL_NAME);
    expect(toolCall.args).toMatchObject({
      document: {
        metadata: {
          title: "Dashboard Starter",
        },
      },
    });

    const args = toolCall.args as {
      document?: { root?: { nodeType?: string } };
    };
    expect(args.document?.root?.nodeType).toBe("layout");
  });

  it("routes /doc load through /api/designs and emits set_document", async () => {
    usePhaseStore.setState({ currentPhase: "explore" });
    useProjectStateStore.getState().setActiveProject("test-project", "seed");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        loaded: true,
        slug: "ops-home",
        projectSlug: "test-project",
        document: {
          metadata: { title: "Loaded Ops Home" },
          root: {
            nodeType: "layout",
            layout: { type: "stack", gap: 12 },
            children: [],
          },
        },
        dataContext: { total: 42 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-doc-load-1", "/doc load ops-home")])
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/designs?slug=ops-home&projectSlug=test-project"
    );
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a set_document tool call.");
    }
    expect(toolCall.toolName).toBe(SET_DOCUMENT_TOOL_NAME);
    expect(toolCall.args).toMatchObject({
      slug: "ops-home",
      projectSlug: "test-project",
      persist: false,
      data: { total: 42 },
      document: {
        metadata: { title: "Loaded Ops Home" },
      },
    });
  });

  it("returns a save_template tool call when /template save is requested", async () => {
    usePhaseStore.setState({ currentPhase: "explore" });
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([
        createUserMessage(
          "u-template-save-1",
          '/template save {"name":"Ops Dashboard","description":"Ops starter","category":"dashboard","slug":"ops-dashboard"}'
        ),
      ])
    );

    expect(adapter.run).not.toHaveBeenCalled();
    const toolCall = result.content?.find((part) => part.type === "tool-call");
    if (!toolCall || toolCall.type !== "tool-call") {
      throw new Error("Expected a save_template tool call.");
    }
    expect(toolCall.toolName).toBe(SAVE_TEMPLATE_TOOL_NAME);
    expect(toolCall.args).toMatchObject({
      name: "Ops Dashboard",
      description: "Ops starter",
      category: "dashboard",
      slug: "ops-dashboard",
    });
  });

  it("returns a descriptive error when /doc template is unknown", async () => {
    usePhaseStore.setState({ currentPhase: "explore" });
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([
        createUserMessage("u-doc-template-2", "/doc template does-not-exist"),
      ])
    );

    expect(result.status).toMatchObject({ type: "complete", reason: "stop" });
    const text = result.content?.find((part) => part.type === "text");
    expect(text?.type).toBe("text");
    if (text?.type === "text") {
      expect(text.text).toContain("Unknown template");
      expect(text.text).toContain("dashboard");
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

  it("returns a usage error when /template save args are missing", async () => {
    usePhaseStore.setState({ currentPhase: "explore" });
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const result = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-template-save-2", "/template save")])
    );

    expect(result.status).toMatchObject({ type: "complete", reason: "stop" });
    const text = result.content?.find((part) => part.type === "text");
    expect(text?.type).toBe("text");
    if (text?.type === "text") {
      expect(text.text).toContain("Template save requires JSON args");
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

  it("summarizes demo tool results", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage("a-1", DEMO_TOOL_NAME, {
      acknowledged: true,
      notes: "Confirmed.",
      resolvedAt: "2025-01-01T00:00:00.000Z",
    }, true);

    const result = await runOnce(wrapped,
      createRunOptions([assistantMessage], assistantMessage)
    );

    expect(adapter.run).not.toHaveBeenCalled();
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Demo tool result captured"),
    });
  });

  it("summarizes signal tool results", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage("a-2", SIGNAL_TOOL_NAME, {
      signal: "green",
      resolvedAt: "2025-01-01T00:00:00.000Z",
    }, true);

    const result = await runOnce(wrapped,
      createRunOptions([assistantMessage], assistantMessage)
    );

    expect(adapter.run).not.toHaveBeenCalled();
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: "Signal recorded: green.",
    });
  });

  it("summarizes phase tool results", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage(
      "a-3",
      PHASE_TRANSITION_TOOL_NAME,
      {
        previousPhase: "ingest",
        nextPhase: "explore",
        approved: true,
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
      text: "Phase transitioned: ingest -> explore.",
    });
  });

  it("summarizes review gate tool results", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage(
      "a-4",
      REVIEW_GATE_TOOL_NAME,
      {
        phase: "review",
        decision: "approved",
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
      text: "Review gate decision recorded: review -> approved.",
    });
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

  it("summarizes save template tool results", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);
    const assistantMessage = createAssistantToolMessage(
      "a-template-save-1",
      SAVE_TEMPLATE_TOOL_NAME,
      {
        saved: true,
        slug: "ops-dashboard",
        requiredComponents: ["oods:Tabs", "oods:Card"],
        nodeCount: 6,
        componentCount: 4,
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
      text: "Template saved: ops-dashboard (2 required components).",
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

  describe("phase gating", () => {
    it("allows /bundle in ingest phase (default)", async () => {
      // Default phase is ingest, bundle is allowed in ingest
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("u-pg-1", "/bundle {}")])
      );

      const toolCall = result.content?.find(
        (part) => part.type === "tool-call"
      );
      expect(toolCall?.type).toBe("tool-call");
      if (toolCall?.type === "tool-call") {
        expect(toolCall.toolName).toBe(LOAD_BUNDLE_TOOL_NAME);
      }
    });

    it("blocks /render in ingest phase with descriptive error", async () => {
      // Default phase is ingest, render is not allowed in ingest
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([
          createUserMessage("u-pg-2", '/render {"type":"component"}'),
        ])
      );

      expect(adapter.run).not.toHaveBeenCalled();
      expect(result.status).toMatchObject({
        type: "complete",
        reason: "stop",
      });
      const text = result.content?.find((part) => part.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text") {
        expect(text.text).toContain("render_component");
        expect(text.text).toContain("ingest");
        expect(text.text).toContain("explore");
        expect(text.text).toContain("tune");
      }
    });

    it("blocks /review in ingest phase", async () => {
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("u-pg-3", "/review approve")])
      );

      const text = result.content?.find((part) => part.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text") {
        expect(text.text).toContain("review_gate");
        expect(text.text).toContain("ingest");
      }
    });

    it("blocks /tokens in ingest phase", async () => {
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([
          createUserMessage("u-pg-4", "/tokens color.primary=#fff"),
        ])
      );

      const text = result.content?.find((part) => part.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text") {
        expect(text.text).toContain("update_token_state");
        expect(text.text).toContain("ingest");
      }
    });

    it("allows /tokens in ingest phase when workflow mode is flexible", async () => {
      usePhaseStore.setState({ currentPhase: "ingest", workflowMode: "flexible" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(
        wrapped,
        createRunOptions([
          createUserMessage("u-pg-4-flex", "/tokens color.primary=#fff"),
        ])
      );

      const toolCall = result.content?.find((part) => part.type === "tool-call");
      expect(toolCall?.type).toBe("tool-call");
      if (toolCall?.type === "tool-call") {
        expect(toolCall.toolName).toBe(TOKEN_ADJUSTMENT_TOOL_NAME);
      }
    });

    it("allows /doc in ingest phase", async () => {
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("u-pg-5", "/doc {}")])
      );

      const toolCall = result.content?.find((part) => part.type === "tool-call");
      expect(toolCall?.type).toBe("tool-call");
      if (toolCall?.type === "tool-call") {
        expect(toolCall.toolName).toBe(SET_DOCUMENT_TOOL_NAME);
      }
    });

    it("blocks /template in ingest phase", async () => {
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([
          createUserMessage(
            "u-pg-template-1",
            '/template save {"name":"Ops","description":"Ops","category":"dashboard"}'
          ),
        ])
      );

      const text = result.content?.find((part) => part.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text") {
        expect(text.text).toContain("save_template");
        expect(text.text).toContain("ingest");
      }
    });

    it("allows /phase in every phase (always available)", async () => {
      const phases = [
        "ingest",
        "explore",
        "tune",
        "review",
        "done",
      ] as const;

      for (const phase of phases) {
        resetPhaseState();
        if (phase !== "ingest") {
          usePhaseStore.setState({ currentPhase: phase });
        }
        const adapter = createAdapter();
        const wrapped = withToolCommands(adapter);
        const result = await runOnce(wrapped, 
          createRunOptions([
            createUserMessage(`u-phase-${phase}`, "/phase explore"),
          ])
        );

        const toolCall = result.content?.find(
          (part) => part.type === "tool-call"
        );
        expect(toolCall?.type).toBe("tool-call");
        if (toolCall?.type === "tool-call") {
          expect(toolCall.toolName).toBe(PHASE_TRANSITION_TOOL_NAME);
        }
      }
    });

    it("allows /signal in every phase (always available)", async () => {
      const phases = [
        "ingest",
        "explore",
        "tune",
        "review",
        "done",
      ] as const;

      for (const phase of phases) {
        resetPhaseState();
        if (phase !== "ingest") {
          usePhaseStore.setState({ currentPhase: phase });
        }
        const adapter = createAdapter();
        const wrapped = withToolCommands(adapter);
        const result = await runOnce(wrapped, 
          createRunOptions([
            createUserMessage(`u-signal-${phase}`, "/signal check"),
          ])
        );

        const toolCall = result.content?.find(
          (part) => part.type === "tool-call"
        );
        expect(toolCall?.type).toBe("tool-call");
        if (toolCall?.type === "tool-call") {
          expect(toolCall.toolName).toBe(SIGNAL_TOOL_NAME);
        }
      }
    });

    it("allows /render in explore phase", async () => {
      usePhaseStore.setState({ currentPhase: "explore" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([
          createUserMessage("u-pg-6", '/render {"type":"component"}'),
        ])
      );

      const toolCall = result.content?.find(
        (part) => part.type === "tool-call"
      );
      expect(toolCall?.type).toBe("tool-call");
      if (toolCall?.type === "tool-call") {
        expect(toolCall.toolName).toBe(RENDER_COMPONENT_TOOL_NAME);
      }
    });

    it("allows /render in tune phase", async () => {
      usePhaseStore.setState({ currentPhase: "tune" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([
          createUserMessage("u-pg-7", '/render {"type":"component"}'),
        ])
      );

      const toolCall = result.content?.find(
        (part) => part.type === "tool-call"
      );
      expect(toolCall?.type).toBe("tool-call");
      if (toolCall?.type === "tool-call") {
        expect(toolCall.toolName).toBe(RENDER_COMPONENT_TOOL_NAME);
      }
    });

    it("allows /tokens in tune phase", async () => {
      usePhaseStore.setState({ currentPhase: "tune" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([
          createUserMessage("u-pg-8", "/tokens color.primary=#111"),
        ])
      );

      const toolCall = result.content?.find(
        (part) => part.type === "tool-call"
      );
      expect(toolCall?.type).toBe("tool-call");
      if (toolCall?.type === "tool-call") {
        expect(toolCall.toolName).toBe(TOKEN_ADJUSTMENT_TOOL_NAME);
      }
    });

    it("allows /review in review phase", async () => {
      usePhaseStore.setState({ currentPhase: "review" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("u-pg-9", "/review approve")])
      );

      const toolCall = result.content?.find(
        (part) => part.type === "tool-call"
      );
      expect(toolCall?.type).toBe("tool-call");
      if (toolCall?.type === "tool-call") {
        expect(toolCall.toolName).toBe(REVIEW_GATE_TOOL_NAME);
      }
    });

    it("blocks /bundle in explore phase", async () => {
      usePhaseStore.setState({ currentPhase: "explore" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("u-pg-10", "/bundle {}")])
      );

      const text = result.content?.find((part) => part.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text") {
        expect(text.text).toContain("load_bundle");
        expect(text.text).toContain("explore");
        expect(text.text).toContain("ingest");
      }
    });

    it("blocks /review in tune phase", async () => {
      usePhaseStore.setState({ currentPhase: "tune" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("u-pg-11", "/review approve")])
      );

      const text = result.content?.find((part) => part.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text") {
        expect(text.text).toContain("review_gate");
        expect(text.text).toContain("tune");
      }
    });

    it("phase-gates executeTool for out-of-phase tools", async () => {
      // Default phase is ingest, render_component not allowed
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await wrapped.executeTool!({
        toolName: RENDER_COMPONENT_TOOL_NAME,
        args: { requestId: "test", schema: {} },
        toolCallId: "tc-1",
        abortSignal: new AbortController().signal,
      });

      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain(
        "render_component"
      );
      expect((result as { error: string }).error).toContain("ingest");
    });

    it("phase-gates executeTool allows in-phase tools to proceed", async () => {
      // In ingest phase, load_bundle should pass through to adapter.executeTool
      const adapter = createAdapter();
      const mockExecuteTool = vi.fn(async () => ({
        loaded: true,
        componentCount: 2,
        tokenSuggestionCount: 3,
      }));
      (adapter as ChatModelAdapter).executeTool = mockExecuteTool;
      const wrapped = withToolCommands(adapter as ChatModelAdapter);

      await wrapped.executeTool!({
        toolName: LOAD_BUNDLE_TOOL_NAME,
        args: { requestId: "test", bundleJson: "{}" },
        toolCallId: "tc-2",
        abortSignal: new AbortController().signal,
      });

      // load_bundle doesn't have a local executor, so it delegates
      expect(mockExecuteTool).toHaveBeenCalled();
    });

    it("blocks /export in ingest phase", async () => {
      // Default phase is ingest, export_design only available in done
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("u-pg-export-1", "/export html")])
      );

      const text = result.content?.find((part) => part.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text") {
        expect(text.text).toContain("export_design");
        expect(text.text).toContain("ingest");
        expect(text.text).toContain("done");
      }
    });

    it("allows /export in done phase", async () => {
      usePhaseStore.setState({ currentPhase: "done" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("u-pg-export-2", "/export json")])
      );

      const toolCall = result.content?.find(
        (part) => part.type === "tool-call"
      );
      expect(toolCall?.type).toBe("tool-call");
      if (toolCall?.type === "tool-call") {
        expect(toolCall.toolName).toBe(EXPORT_DESIGN_TOOL_NAME);
      }
    });
  });

  describe("/export command", () => {
    it("returns an export tool call with default html format", async () => {
      usePhaseStore.setState({ currentPhase: "done" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("u-export-1", "/export")])
      );

      expect(adapter.run).not.toHaveBeenCalled();
      const toolCall = result.content?.find(
        (part) => part.type === "tool-call"
      );
      if (!toolCall || toolCall.type !== "tool-call") {
        throw new Error("Expected an export tool call.");
      }
      expect(toolCall.toolName).toBe(EXPORT_DESIGN_TOOL_NAME);
      expect(toolCall.args).toMatchObject({ format: "html" });
      expect(result.status).toMatchObject({ type: "requires-action" });
    });

    it("parses format from input", async () => {
      usePhaseStore.setState({ currentPhase: "done" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("u-export-2", "/export yaml")])
      );

      const toolCall = result.content?.find(
        (part) => part.type === "tool-call"
      );
      if (!toolCall || toolCall.type !== "tool-call") {
        throw new Error("Expected an export tool call.");
      }
      expect(toolCall.args).toMatchObject({ format: "yaml" });
    });

    it("parses SCSS format and slug from input", async () => {
      usePhaseStore.setState({ currentPhase: "done" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("u-export-2b", "/export scss design-system")])
      );

      const toolCall = result.content?.find(
        (part) => part.type === "tool-call"
      );
      if (!toolCall || toolCall.type !== "tool-call") {
        throw new Error("Expected an export tool call.");
      }
      expect(toolCall.args).toMatchObject({ format: "scss", slug: "design-system" });
    });

    it("parses spec format from input", async () => {
      usePhaseStore.setState({ currentPhase: "done" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([createUserMessage("u-export-2c", "/export spec")])
      );

      const toolCall = result.content?.find(
        (part) => part.type === "tool-call"
      );
      if (!toolCall || toolCall.type !== "tool-call") {
        throw new Error("Expected an export tool call.");
      }
      expect(toolCall.args).toMatchObject({ format: "spec" });
    });

    it("parses format and slug from input", async () => {
      usePhaseStore.setState({ currentPhase: "done" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);
      const result = await runOnce(wrapped, 
        createRunOptions([
          createUserMessage("u-export-3", "/export json my-design"),
        ])
      );

      const toolCall = result.content?.find(
        (part) => part.type === "tool-call"
      );
      if (!toolCall || toolCall.type !== "tool-call") {
        throw new Error("Expected an export tool call.");
      }
      expect(toolCall.args).toMatchObject({
        format: "json",
        slug: "my-design",
      });
    });

    it("summarizes export result on success", async () => {
      usePhaseStore.setState({ currentPhase: "done" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);

      const assistantMsg = createAssistantToolMessage(
        "a-export-1",
        EXPORT_DESIGN_TOOL_NAME,
        {
          exported: true,
          format: "html",
          slug: "test",
          content: "<html>...</html>",
          resolvedAt: new Date().toISOString(),
        },
        true
      );

      const result = await runOnce(wrapped,
        createRunOptions([assistantMsg], assistantMsg)
      );

      const text = result.content?.find((part) => part.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text") {
        expect(text.text).toContain("Export complete");
        expect(text.text).toContain("HTML");
      }
    });

    it("summarizes export result on failure", async () => {
      usePhaseStore.setState({ currentPhase: "done" });
      const adapter = createAdapter();
      const wrapped = withToolCommands(adapter);

      const assistantMsg = createAssistantToolMessage(
        "a-export-2",
        EXPORT_DESIGN_TOOL_NAME,
        {
          exported: false,
          format: "html",
          slug: "test",
          content: "",
          errors: ["No active design document."],
          resolvedAt: new Date().toISOString(),
        },
        true
      );

      const result = await runOnce(wrapped,
        createRunOptions([assistantMsg], assistantMsg)
      );

      const text = result.content?.find((part) => part.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text") {
        expect(text.text).toContain("Export failed");
        expect(text.text).toContain("No active design document.");
      }
    });
  });
});
