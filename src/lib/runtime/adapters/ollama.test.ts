import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOllamaAdapter } from "./ollama";

// adapter.run() is typed Promise<ChatModelRunResult> | AsyncGenerator<...>; the
// Ollama adapter streams (a generator). Narrow + drain it without weakening types.
const collectRun = async (
  adapter: ChatModelAdapter,
  runOptions: ChatModelRunOptions
): Promise<ChatModelRunResult[]> => {
  const runResult = adapter.run(runOptions);
  const updates: ChatModelRunResult[] = [];
  if (
    typeof runResult === "object" &&
    runResult !== null &&
    Symbol.asyncIterator in runResult
  ) {
    for await (const update of runResult as AsyncGenerator<
      ChatModelRunResult,
      void
    >) {
      updates.push(update);
    }
  } else {
    updates.push(await runResult);
  }
  return updates;
};

// CI-critical streaming contract test suite for Ollama adapter behavior.

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

const createRunOptions = (messages: ThreadMessage[]): ChatModelRunOptions => ({
  messages,
  runConfig: {},
  abortSignal: new AbortController().signal,
  context: {},
  config: {},
  unstable_getMessage: () => messages[messages.length - 1],
});

const createStreamResponse = (lines: string[]) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      lines.forEach((line) => controller.enqueue(encoder.encode(line)));
      controller.close();
    },
  });

  return new Response(stream, { status: 200 });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createOllamaAdapter", () => {
  it("streams deltas and completes the run", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createStreamResponse([
        '{"message":{"content":"Hello "},"done":false}\n',
        '{"message":{"content":"Workbench"},"done":true}\n',
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const onResponse = vi.fn();
    const adapter = createOllamaAdapter({
      baseUrl: "http://ollama.local",
      model: "llama3",
      onResponse,
    });

    const updates = await collectRun(
      adapter,
      createRunOptions([createUserMessage("u-1", "Hi there")])
    );

    const call = fetchMock.mock.calls[0];
    if (!call) {
      throw new Error("Expected fetch to be called.");
    }
    const [url, options] = call as [string, RequestInit];
    expect(url).toBe("http://ollama.local/api/chat");
    if (typeof options.body !== "string") {
      throw new Error("Expected a JSON request body.");
    }
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ model: "llama3", stream: true });
    expect(body.messages).toEqual([{ role: "user", content: "Hi there" }]);

    const textUpdates = updates
      .map((update) => update.content?.[0])
      .filter(
        (part): part is { type: "text"; text: string } => part?.type === "text"
      )
      .map((part) => part.text);
    expect(textUpdates).toEqual(["Hello ", "Hello Workbench"]);
    expect(updates.at(-1)?.status).toMatchObject({
      type: "complete",
      reason: "stop",
    });
    expect(onResponse).toHaveBeenCalledOnce();
  });

  it("surfaces request failures as runtime errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("Bad gateway", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    const onError = vi.fn();
    const adapter = createOllamaAdapter({
      baseUrl: "http://ollama.local",
      model: "llama3",
      onError,
    });

    const updates = await collectRun(
      adapter,
      createRunOptions([createUserMessage("u-2", "Hello")])
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(updates[0]?.status).toMatchObject({
      type: "incomplete",
      reason: "error",
    });
    const textPart = updates[0]?.content?.[0];
    if (textPart?.type === "text") {
      expect(textPart.text).toContain("Ollama request failed");
    } else {
      throw new Error("Expected a text error response.");
    }
  });
});
