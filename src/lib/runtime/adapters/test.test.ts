import type { ChatModelRunOptions, ThreadMessage } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";

import { createTestAdapter } from "./test";

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

const createRunOptions = (messages: ThreadMessage[]): ChatModelRunOptions => ({
  messages,
  runConfig: {},
  abortSignal: new AbortController().signal,
  context: {},
  config: {},
  unstable_getMessage: () => messages[messages.length - 1],
});

describe("createTestAdapter", () => {
  it("echoes the latest user message", async () => {
    const adapter = createTestAdapter();
    const result = await adapter.run(
      createRunOptions([createUserMessage("u-1", "Hello Workbench")])
    );

    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: "Echo: Hello Workbench",
    });
  });

  it("returns the default prompt when no user message exists", async () => {
    const adapter = createTestAdapter();
    const result = await adapter.run(
      createRunOptions([createSystemMessage("s-1", "System ready")])
    );

    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("Stage1");
  });

  it("surfaces a simulated runtime error", async () => {
    const onError = vi.fn();
    const adapter = createTestAdapter({ onError });
    const result = await adapter.run(
      createRunOptions([createUserMessage("u-2", "/error")])
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.status).toMatchObject({
      type: "incomplete",
      reason: "error",
    });
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Runtime error"),
    });
  });
});
