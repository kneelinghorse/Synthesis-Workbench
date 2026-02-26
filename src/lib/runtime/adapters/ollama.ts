import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";

type OllamaAdapterOptions = {
  baseUrl?: string;
  model?: string;
  onError?: (error: unknown) => void;
  onResponse?: () => void;
};

type OllamaConfig = {
  baseUrl: string;
  model: string;
};

type OllamaMessage = {
  role: "assistant" | "user" | "system";
  content: string;
};

type OllamaStreamChunk = {
  message?: {
    content?: string;
  };
  response?: string;
  done?: boolean;
  error?: string;
};

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3";

const readBaseUrl = (): string | undefined => process.env.OLLAMA_BASE_URL;

const readModel = (): string | undefined => process.env.OLLAMA_MODEL;

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.replace(/\/+$/, "");

const buildOllamaMessages = (
  messages: readonly ThreadMessage[]
): OllamaMessage[] =>
  messages.flatMap((message) => {
    if (
      message.role !== "assistant" &&
      message.role !== "user" &&
      message.role !== "system"
    ) {
      return [];
    }

    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join("\n");

    if (!text) return [];

    return [
      {
        role: message.role,
        content: text,
      },
    ];
  });

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

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) return error.name === "AbortError";
  if (error instanceof Error) return error.name === "AbortError";
  return false;
};

const parseStreamLine = (line: string): OllamaStreamChunk => {
  if (line === "[DONE]") {
    return { done: true };
  }

  try {
    return JSON.parse(line) as OllamaStreamChunk;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid Ollama stream chunk: ${detail}`);
  }
};

export const getOllamaConfig = (): OllamaConfig => ({
  baseUrl: readBaseUrl()?.trim() || DEFAULT_BASE_URL,
  model: readModel()?.trim() || DEFAULT_MODEL,
});

export const isOllamaConfigured = (): boolean => {
  const baseUrl = readBaseUrl()?.trim();
  const model = readModel()?.trim();
  return Boolean(baseUrl) && Boolean(model);
};

export const createOllamaAdapter = (
  options: OllamaAdapterOptions = {}
): ChatModelAdapter => {
  const envConfig = getOllamaConfig();
  const config = {
    baseUrl: options.baseUrl?.trim() || envConfig.baseUrl,
    model: options.model?.trim() || envConfig.model,
  };

  return {
    async *run({
      messages,
      abortSignal,
    }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
      if (abortSignal.aborted) {
        yield { status: { type: "incomplete", reason: "cancelled" } };
        return;
      }

      try {
        const payloadMessages = buildOllamaMessages(messages);
        if (!payloadMessages.length) {
          throw new Error("No text content available to send to Ollama.");
        }

        const response = await fetch(
          `${normalizeBaseUrl(config.baseUrl)}/api/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: config.model,
              messages: payloadMessages,
              stream: true,
            }),
            signal: abortSignal,
          }
        );

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const suffix = detail.trim() ? `: ${detail.trim()}` : "";
          throw new Error(`Ollama request failed (${response.status})${suffix}`);
        }

        if (!response.body) {
          throw new Error("Ollama response stream is unavailable.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";
        let hasResponse = false;

        const markResponse = () => {
          if (!hasResponse) {
            hasResponse = true;
            options.onResponse?.();
          }
        };

        const emitDelta = (delta: string): ChatModelRunResult | undefined => {
          if (!delta) return undefined;
          accumulatedText += delta;
          markResponse();
          return {
            content: [{ type: "text", text: accumulatedText }],
          };
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let newlineIndex = buffer.indexOf("\n");
          while (newlineIndex >= 0) {
            const rawLine = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf("\n");

            if (!rawLine) continue;

            const cleanedLine = rawLine.startsWith("data:")
              ? rawLine.slice(5).trim()
              : rawLine;

            if (!cleanedLine) continue;

            const payload = parseStreamLine(cleanedLine);

            if (payload.error) {
              throw new Error(payload.error);
            }

            const delta = payload.message?.content ?? payload.response ?? "";
            const update = emitDelta(delta);
            if (update) {
              yield update;
            }

            if (payload.done) {
              yield { status: { type: "complete", reason: "stop" } };
              return;
            }
          }
        }

        const remainder = `${buffer}${decoder.decode()}`.trim();
        if (remainder) {
          const payload = parseStreamLine(remainder);
          if (payload.error) {
            throw new Error(payload.error);
          }

          const delta = payload.message?.content ?? payload.response ?? "";
          const update = emitDelta(delta);
          if (update) {
            yield update;
          }
        }

        yield { status: { type: "complete", reason: "stop" } };
      } catch (error) {
        if (abortSignal.aborted || isAbortError(error)) {
          yield { status: { type: "incomplete", reason: "cancelled" } };
          return;
        }

        options.onError?.(error);
        yield buildErrorResult(error);
      }
    },
  };
};
