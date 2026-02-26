import type {
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAnthropicAdapter } from "./anthropic";

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

const createSystemMessage = (id: string, text: string): ThreadMessage => ({
  id,
  createdAt: new Date(),
  role: "system",
  content: [{ type: "text", text }],
  metadata: {
    custom: {},
  },
});

const createAssistantToolResultMessage = (
  id: string,
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  result: unknown
): ThreadMessage => ({
  id,
  createdAt: new Date(),
  role: "assistant",
  content: [
    {
      type: "tool-call",
      toolCallId,
      toolName,
      args,
      argsText: JSON.stringify(args),
      result,
    },
  ],
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

const collectUpdates = async (
  run: ReturnType<typeof createAnthropicAdapter>["run"],
  options: ChatModelRunOptions
): Promise<ChatModelRunResult[]> => {
  const updates: ChatModelRunResult[] = [];
  for await (const update of run(options)) {
    updates.push(update);
  }
  return updates;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createAnthropicAdapter", () => {
  it("streams text deltas and completes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createStreamResponse([
        "event: message_start\n",
        'data: {"type":"message_start","message":{"id":"msg_1"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "},"index":0}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Workbench"},"index":0}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const onResponse = vi.fn();
    const adapter = createAnthropicAdapter({
      baseUrl: "https://proxy.local/anthropic",
      model: "claude-test",
      maxTokens: 2048,
      onResponse,
    });

    const updates = await collectUpdates(
      adapter.run,
      createRunOptions([createUserMessage("u-1", "Hi there")])
    );

    const call = fetchMock.mock.calls[0];
    if (!call) {
      throw new Error("Expected fetch to be called.");
    }
    const [url, options] = call as [string, RequestInit];
    expect(url).toBe("https://proxy.local/anthropic");
    if (typeof options.body !== "string") {
      throw new Error("Expected a JSON request body.");
    }
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      model: "claude-test",
      max_tokens: 2048,
      stream: true,
    });
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "Hi there" }],
      },
    ]);
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools.length).toBeGreaterThan(0);

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

  it("emits requires-action when Anthropic streams tool_use blocks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createStreamResponse([
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"render_component"}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"requestId\\":\\"req-1\\",\\"schema\\":{\\"component\\":\\"Button\\"},\\"validate\\":true}"}}\n\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createAnthropicAdapter({
      baseUrl: "https://proxy.local/anthropic",
    });

    const updates = await collectUpdates(
      adapter.run,
      createRunOptions([createUserMessage("u-tool-1", "Render a button")])
    );

    const finalUpdate = updates.at(-1);
    expect(finalUpdate?.status).toMatchObject({
      type: "requires-action",
      reason: "tool-calls",
    });

    const toolCall = finalUpdate?.content?.find(
      (part) => part.type === "tool-call"
    );
    expect(toolCall?.type).toBe("tool-call");
    if (toolCall?.type === "tool-call") {
      expect(toolCall.toolCallId).toBe("toolu_1");
      expect(toolCall.toolName).toBe("render_component");
      expect(toolCall.args).toMatchObject({
        requestId: "req-1",
        schema: { component: "Button" },
        validate: true,
      });
    }
  });

  it("sends tool_result messages back on the next call and continues streaming text", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createStreamResponse([
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_42","name":"render_component"}}\n\n',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"requestId\\":\\"req-42\\",\\"schema\\":{\\"component\\":\\"Card\\"}}"}}\n\n',
          'data: {"type":"content_block_stop","index":0}\n\n',
          'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
          'data: {"type":"message_stop"}\n\n',
        ])
      )
      .mockResolvedValueOnce(
        createStreamResponse([
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Rendered and ready."},"index":0}\n\n',
          'data: {"type":"message_stop"}\n\n',
        ])
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createAnthropicAdapter({
      baseUrl: "https://proxy.local/anthropic",
    });

    const firstRunMessages = [createUserMessage("u-loop-1", "Render a card")];
    const firstRun = await collectUpdates(
      adapter.run,
      createRunOptions(firstRunMessages)
    );
    expect(firstRun.at(-1)?.status).toMatchObject({
      type: "requires-action",
      reason: "tool-calls",
    });

    const secondRunMessages: ThreadMessage[] = [
      ...firstRunMessages,
      createAssistantToolResultMessage(
        "a-loop-1",
        "toolu_42",
        "render_component",
        {
          requestId: "req-42",
          schema: { component: "Card" },
        },
        {
          rendered: true,
          html: "<div>Card</div>",
          errors: [],
        }
      ),
    ];

    const secondRun = await collectUpdates(
      adapter.run,
      createRunOptions(secondRunMessages)
    );
    expect(secondRun.at(-1)?.status).toMatchObject({
      type: "complete",
      reason: "stop",
    });

    const secondCall = fetchMock.mock.calls[1];
    if (!secondCall) {
      throw new Error("Expected second fetch call.");
    }
    const [, secondOptions] = secondCall as [string, RequestInit];
    if (typeof secondOptions.body !== "string") {
      throw new Error("Expected second JSON request body.");
    }
    const secondBody = JSON.parse(secondOptions.body) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(secondBody.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          content: expect.arrayContaining([
            expect.objectContaining({
              type: "tool_use",
              id: "toolu_42",
              name: "render_component",
            }),
          ]),
        }),
        expect.objectContaining({
          role: "user",
          content: expect.arrayContaining([
            expect.objectContaining({
              type: "tool_result",
              tool_use_id: "toolu_42",
            }),
          ]),
        }),
      ])
    );
  });

  it("defaults max_tokens to 4096 when not provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createStreamResponse([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"},"index":0}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createAnthropicAdapter({
      baseUrl: "https://proxy.local/anthropic",
    });

    await collectUpdates(
      adapter.run,
      createRunOptions([createUserMessage("u-1b", "Default tokens")])
    );

    const call = fetchMock.mock.calls[0];
    if (!call) {
      throw new Error("Expected fetch to be called.");
    }
    const [, options] = call as [string, RequestInit];
    if (typeof options.body !== "string") {
      throw new Error("Expected a JSON request body.");
    }
    const body = JSON.parse(options.body);
    expect(body.max_tokens).toBe(4096);
  });

  it("returns a runtime error when no user messages are present", async () => {
    const onError = vi.fn();
    const adapter = createAnthropicAdapter({
      onError,
    });

    const updates = await collectUpdates(
      adapter.run,
      createRunOptions([createSystemMessage("s-1", "System ready")])
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(updates[0]?.status).toMatchObject({
      type: "incomplete",
      reason: "error",
    });
  });

  it("blocks runaway tool loops at max iteration limit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createAnthropicAdapter({
      maxToolIterations: 5,
    });

    const baseUser = createUserMessage("u-max-loop", "Continue tool loop");
    const history = Array.from({ length: 5 }, (_, index) =>
      createAssistantToolResultMessage(
        `a-max-${index}`,
        `toolu-max-${index}`,
        "render_component",
        {
          requestId: `req-max-${index}`,
          schema: { component: "Button" },
        },
        {
          rendered: true,
        }
      )
    );

    const updates = await collectUpdates(
      adapter.run,
      createRunOptions([baseUser, ...history])
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates[0]?.status).toMatchObject({
      type: "incomplete",
      reason: "error",
    });
    const textPart = updates[0]?.content?.[0];
    if (textPart?.type === "text") {
      expect(textPart.text).toContain("max iterations");
    } else {
      throw new Error("Expected max-iteration error text.");
    }
  });

  it("surfaces request failures as runtime errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("Forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const onError = vi.fn();
    const adapter = createAnthropicAdapter({
      baseUrl: "https://proxy.local/anthropic",
      onError,
    });

    const updates = await collectUpdates(
      adapter.run,
      createRunOptions([createUserMessage("u-2", "Hello")])
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(updates[0]?.status).toMatchObject({
      type: "incomplete",
      reason: "error",
    });
    const textPart = updates[0]?.content?.[0];
    if (textPart?.type === "text") {
      expect(textPart.text).toContain("Anthropic request failed");
    } else {
      throw new Error("Expected a text error response.");
    }
  });
});
