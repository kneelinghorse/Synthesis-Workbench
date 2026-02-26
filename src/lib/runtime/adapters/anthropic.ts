import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";

import {
  getAnthropicToolDefinitions,
  type AnthropicToolDefinition,
} from "@/lib/runtime/tools/tool-definitions";

type AnthropicAdapterOptions = {
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  maxToolIterations?: number;
  tools?: readonly AnthropicToolDefinition[];
  onError?: (error: unknown) => void;
  onResponse?: () => void;
};

type AnthropicTextContentBlock = {
  type: "text";
  text: string;
};

type AnthropicToolUseContentBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

type AnthropicToolResultContentBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

type AnthropicContentBlock =
  | AnthropicTextContentBlock
  | AnthropicToolUseContentBlock
  | AnthropicToolResultContentBlock;

type AnthropicMessage = {
  role: "assistant" | "user";
  content: string | AnthropicContentBlock[];
};

type BuiltAnthropicMessages = {
  system?: string;
  messages: AnthropicMessage[];
  toolRoundTrips: number;
};

type AnthropicStreamEvent = {
  type?: string;
  index?: number;
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    input?: unknown;
  };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string | null;
  };
  error?: {
    message?: string;
  };
};

type AnthropicToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

type ToolUseAccumulator = {
  id: string;
  name: string;
  baseInput: Record<string, unknown>;
  partialJson: string;
};

const DEFAULT_PROXY_URL = "/api/anthropic";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_TOOL_ITERATIONS = 5;

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.replace(/\/+$/, "");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseToolCallArgs = (
  args: unknown,
  argsText?: string
): Record<string, unknown> => {
  if (isRecord(args)) {
    return args;
  }

  if (typeof argsText === "string" && argsText.trim()) {
    try {
      const parsed = JSON.parse(argsText);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
};

const toJsonRecord = (value: Record<string, unknown>): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  return isRecord(parsed) ? parsed : {};
};

const serializeToolResult = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const parseJsonObject = (raw: string): Record<string, unknown> => {
  if (!raw.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (isRecord(parsed)) {
      return parsed;
    }
    throw new Error("Tool call input must be a JSON object.");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid Anthropic tool input JSON: ${detail}`);
  }
};

const buildAnthropicMessages = (
  messages: readonly ThreadMessage[]
): BuiltAnthropicMessages => {
  const systemParts: string[] = [];
  const chatMessages: AnthropicMessage[] = [];
  let toolRoundTrips = 0;

  messages.forEach((message) => {
    if (message.role === "system") {
      const systemText = message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text.trim())
        .filter(Boolean)
        .join("\n");
      if (systemText) {
        systemParts.push(systemText);
      }
      return;
    }

    if (message.role !== "assistant" && message.role !== "user") {
      return;
    }

    const textBlocks: AnthropicTextContentBlock[] = [];
    const assistantToolBlocks: AnthropicToolUseContentBlock[] = [];
    const toolResultBlocks: AnthropicToolResultContentBlock[] = [];

    message.content.forEach((part) => {
      if (part.type === "text") {
        const text = part.text.trim();
        if (text) {
          textBlocks.push({ type: "text", text });
        }
        return;
      }

      if (part.type !== "tool-call" || message.role !== "assistant") {
        return;
      }

      assistantToolBlocks.push({
        type: "tool_use",
        id: part.toolCallId,
        name: part.toolName,
        input: parseToolCallArgs(part.args, part.argsText),
      });

      if (part.result !== undefined) {
        toolRoundTrips += 1;
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: part.toolCallId,
          content: serializeToolResult(part.result),
          ...(part.isError ? { is_error: true } : {}),
        });
      }
    });

    if (message.role === "user") {
      if (textBlocks.length > 0) {
        chatMessages.push({
          role: "user",
          content: textBlocks,
        });
      }
      return;
    }

    const assistantBlocks = [...textBlocks, ...assistantToolBlocks];
    if (assistantBlocks.length > 0) {
      chatMessages.push({
        role: "assistant",
        content: assistantBlocks,
      });
    }

    if (toolResultBlocks.length > 0) {
      chatMessages.push({
        role: "user",
        content: toolResultBlocks,
      });
    }
  });

  const system = systemParts.join("\n\n").trim();
  return {
    system: system ? system : undefined,
    messages: chatMessages,
    toolRoundTrips,
  };
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

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) return error.name === "AbortError";
  if (error instanceof Error) return error.name === "AbortError";
  return false;
};

const parseSseLine = (line: string): AnthropicStreamEvent | null => {
  if (line === "[DONE]") {
    return { type: "message_stop" };
  }

  try {
    return JSON.parse(line) as AnthropicStreamEvent;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid Anthropic stream payload: ${detail}`);
  }
};

export const isAnthropicConfigured = (): boolean =>
  process.env.NEXT_PUBLIC_ANTHROPIC_ENABLED === "true";

export const createAnthropicAdapter = (
  options: AnthropicAdapterOptions = {}
): ChatModelAdapter => {
  const config = {
    baseUrl: options.baseUrl?.trim() || DEFAULT_PROXY_URL,
    model: options.model?.trim(),
    maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    maxToolIterations: options.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS,
    tools: [...(options.tools ?? getAnthropicToolDefinitions())],
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
        const payload = buildAnthropicMessages(messages);
        if (!payload.messages.length) {
          throw new Error("No text or tool content available to send to Anthropic.");
        }

        if (payload.toolRoundTrips >= config.maxToolIterations) {
          throw new Error(
            `Anthropic tool loop exceeded max iterations (${config.maxToolIterations}).`
          );
        }

        const response = await fetch(normalizeBaseUrl(config.baseUrl), {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messages: payload.messages,
            ...(payload.system ? { system: payload.system } : {}),
            stream: true,
            ...(config.model ? { model: config.model } : {}),
            ...(config.maxTokens !== undefined
              ? { max_tokens: config.maxTokens }
              : {}),
            ...(config.tools.length > 0 ? { tools: config.tools } : {}),
          }),
          signal: abortSignal,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const suffix = detail.trim() ? `: ${detail.trim()}` : "";
          throw new Error(
            `Anthropic request failed (${response.status})${suffix}`
          );
        }

        if (!response.body) {
          throw new Error("Anthropic response stream is unavailable.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";
        let hasResponse = false;
        let stopReason: string | null = null;
        const toolUseByIndex = new Map<number, ToolUseAccumulator>();
        const toolCalls: AnthropicToolCall[] = [];

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

        const finalizeToolCall = (index: number) => {
          const pending = toolUseByIndex.get(index);
          if (!pending) {
            return;
          }

          const parsedInput = pending.partialJson
            ? parseJsonObject(pending.partialJson)
            : {};

          toolCalls.push({
            id: pending.id,
            name: pending.name,
            input: {
              ...pending.baseInput,
              ...parsedInput,
            },
          });
          toolUseByIndex.delete(index);
        };

        const finalizeAllToolCalls = () => {
          for (const index of [...toolUseByIndex.keys()]) {
            finalizeToolCall(index);
          }
        };

        const emitToolCallsResult = (): ChatModelRunResult => {
          markResponse();
          const content: Array<NonNullable<ChatModelRunResult["content"]>[number]> = [];
          if (accumulatedText.trim()) {
            content.push({ type: "text", text: accumulatedText });
          }
          for (const call of toolCalls) {
            content.push({
              type: "tool-call",
              toolCallId: call.id,
              toolName: call.name,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              args: toJsonRecord(call.input) as any,
              argsText: JSON.stringify(call.input),
            });
          }
          return {
            content,
            status: {
              type: "requires-action",
              reason: "tool-calls",
            },
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

            if (!rawLine || !rawLine.startsWith("data:")) {
              continue;
            }

            const cleanedLine = rawLine.slice(5).trim();
            if (!cleanedLine) continue;

            const payload = parseSseLine(cleanedLine);
            if (!payload) continue;

            if (payload.type === "error") {
              throw new Error(
                payload.error?.message || "Anthropic stream error."
              );
            }

            if (
              payload.type === "content_block_start" &&
              payload.content_block?.type === "tool_use" &&
              typeof payload.content_block.id === "string" &&
              typeof payload.content_block.name === "string"
            ) {
              const index = payload.index ?? toolUseByIndex.size;
              toolUseByIndex.set(index, {
                id: payload.content_block.id,
                name: payload.content_block.name,
                baseInput: isRecord(payload.content_block.input)
                  ? payload.content_block.input
                  : {},
                partialJson: "",
              });
              continue;
            }

            if (
              payload.type === "content_block_delta" &&
              payload.delta?.type === "input_json_delta"
            ) {
              const index = payload.index ?? 0;
              const pending = toolUseByIndex.get(index);
              if (pending) {
                pending.partialJson += payload.delta.partial_json ?? "";
              }
              continue;
            }

            if (
              payload.type === "content_block_delta" &&
              payload.delta?.type === "text_delta"
            ) {
              const update = emitDelta(payload.delta.text ?? "");
              if (update) {
                yield update;
              }
              continue;
            }

            if (payload.type === "content_block_stop") {
              finalizeToolCall(payload.index ?? 0);
              continue;
            }

            if (payload.type === "message_delta") {
              stopReason = payload.delta?.stop_reason ?? stopReason;
              continue;
            }

            if (payload.type === "message_stop") {
              finalizeAllToolCalls();
              if (toolCalls.length > 0 || stopReason === "tool_use") {
                yield emitToolCallsResult();
                return;
              }

              yield { status: { type: "complete", reason: "stop" } };
              return;
            }
          }
        }

        const remainder = `${buffer}${decoder.decode()}`.trim();
        if (remainder) {
          const payload = parseSseLine(remainder);
          if (payload?.type === "error") {
            throw new Error(
              payload.error?.message || "Anthropic stream error."
            );
          }

          if (
            payload?.type === "content_block_delta" &&
            payload.delta?.type === "text_delta"
          ) {
            const update = emitDelta(payload.delta.text ?? "");
            if (update) {
              yield update;
            }
          }
        }

        finalizeAllToolCalls();
        if (toolCalls.length > 0 || stopReason === "tool_use") {
          yield emitToolCallsResult();
          return;
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
