import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";

type TestAdapterHandlers = {
  onError?: (error: unknown) => void;
  onResponse?: () => void;
};

const DEFAULT_RESPONSE =
  "Ask me about Stage1 bundles, phase planning, or runtime adapters. Type /tool to preview Tool UI.";

const extractLatestUserText = (messages: readonly ThreadMessage[]): string | null => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const textParts = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text);
    const text = textParts.join(" ").trim();
    if (text) return text;
  }
  return null;
};

const buildErrorResult = (error: unknown): ChatModelRunResult => {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: `Runtime error: ${detail}` }],
    status: {
      type: "incomplete",
      reason: "error",
      error: detail,
    },
  };
};

export const createTestAdapter = (
  handlers: TestAdapterHandlers = {}
): ChatModelAdapter => ({
  async run(options: ChatModelRunOptions): Promise<ChatModelRunResult> {
    if (options.abortSignal.aborted) {
      return {
        status: {
          type: "incomplete",
          reason: "cancelled",
        },
      };
    }

    try {
      const latestUserText = extractLatestUserText(options.messages);

      if (latestUserText?.trim().toLowerCase() === "/error") {
        throw new Error("Simulated runtime failure");
      }

      const responseText = latestUserText
        ? `Echo: ${latestUserText}`
        : DEFAULT_RESPONSE;

      handlers.onResponse?.();

      return {
        content: [{ type: "text", text: responseText }],
        status: {
          type: "complete",
          reason: "stop",
        },
      };
    } catch (error) {
      handlers.onError?.(error);
      return buildErrorResult(error);
    }
  },
});
