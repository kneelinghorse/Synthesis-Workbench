import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { withToolCommands } from "@/lib/runtime/adapters/withToolCommands";
import { LOAD_BUNDLE_TOOL_NAME } from "@/lib/runtime/tools/stage1-tools";
import { SET_DOCUMENT_TOOL_NAME } from "@/lib/runtime/tools/document-tools";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { DEFAULT_PHASES } from "@/types/phase";
import { resetPhaseState, usePhaseStore } from "@/lib/stores/phase-state";

const createUserMessage = (id: string, text: string): ThreadMessage => ({
  id,
  createdAt: new Date(),
  role: "user",
  content: [{ type: "text", text }],
  attachments: [],
  metadata: { custom: {} },
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

const createAdapter = (): ChatModelAdapter => ({
  run: vi.fn(async () => ({
    content: [{ type: "text", text: "fallback" }],
    status: { type: "complete", reason: "stop" },
  })),
});

describe("template library quick-start flow", () => {
  beforeEach(() => {
    resetPhaseState();
    useDocumentStateStore.getState().reset();
  });

  it("supports /bundle then /doc template dashboard quick apply", async () => {
    const wrapped = withToolCommands(createAdapter());

    // Ingest phase: /bundle command is available.
    const bundleResult = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-template-1", "/bundle")])
    );
    const bundleCall = bundleResult.content?.find(
      (part) => part.type === "tool-call"
    );
    expect(bundleCall?.type).toBe("tool-call");
    if (bundleCall?.type === "tool-call") {
      expect(bundleCall.toolName).toBe(LOAD_BUNDLE_TOOL_NAME);
    }

    // Explore phase: /doc template command can apply a built-in document quickly.
    const toExplore = usePhaseStore
      .getState()
      .transitionTo("explore", DEFAULT_PHASES);
    expect(toExplore.allowed).toBe(true);

    const docResult = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-template-2", "/doc template dashboard")])
    );
    const docCall = docResult.content?.find((part) => part.type === "tool-call");
    expect(docCall?.type).toBe("tool-call");
    if (!docCall || docCall.type !== "tool-call") {
      throw new Error("Expected set_document tool call.");
    }
    expect(docCall.toolName).toBe(SET_DOCUMENT_TOOL_NAME);

    const executeResult = await wrapped.executeTool!({
      toolName: docCall.toolName,
      args: docCall.args,
      toolCallId: docCall.toolCallId,
      abortSignal: new AbortController().signal,
    });

    const parsedResult = executeResult as {
      saved: boolean;
      componentCount: number;
      nodeCount: number;
    };
    expect(parsedResult.saved).toBe(true);
    expect(parsedResult.componentCount).toBeGreaterThan(0);
    expect(parsedResult.nodeCount).toBeGreaterThan(0);

    const activeDocument = useDocumentStateStore.getState().document;
    expect(activeDocument?.metadata.title).toBe("Dashboard Starter");
    expect(activeDocument?.root.nodeType).toBe("layout");
  });
});
