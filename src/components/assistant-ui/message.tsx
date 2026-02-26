"use client";

import {
  MessagePrimitive,
  TextMessagePartProvider,
  useAssistantState,
  useMessage,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const MarkdownText = () => (
  <MarkdownTextPrimitive
    className="text-sm leading-relaxed text-white/90"
    remarkPlugins={[remarkGfm]}
  />
);

type MessagePartGroup = {
  groupKey: string | undefined;
  indices: number[];
};

const groupTextParts = (
  parts: readonly { type?: string }[]
): MessagePartGroup[] => {
  const groups: MessagePartGroup[] = [];
  let currentTextGroup: number[] | null = null;

  const flushTextGroup = () => {
    if (!currentTextGroup) return;
    groups.push({ groupKey: "text", indices: currentTextGroup });
    currentTextGroup = null;
  };

  parts.forEach((part, index) => {
    if (part?.type === "text") {
      if (!currentTextGroup) currentTextGroup = [];
      currentTextGroup.push(index);
      return;
    }

    flushTextGroup();
    groups.push({ groupKey: part?.type, indices: [index] });
  });

  flushTextGroup();
  return groups;
};

const MessageGroup = ({
  groupKey,
  indices,
  children,
}: {
  groupKey: string | undefined;
  indices: number[];
  children?: ReactNode;
}) => {
  const parts = useAssistantState((state) => state.message.parts);
  const status = useAssistantState((state) => state.message.status);

  if (groupKey !== "text") {
    return <>{children}</>;
  }

  const text = indices
    .map((index) => parts[index])
    .filter((part) => part?.type === "text")
    .map((part) => (part as { text: string }).text)
    .join("");

  if (!text) return null;

  return (
    <TextMessagePartProvider text={text} isRunning={status?.type === "running"}>
      <MarkdownText />
    </TextMessagePartProvider>
  );
};

const MessageStatus = () => {
  const status = useMessage((state) => state.status);

  if (!status || status.type === "complete") return null;

  const label =
    status.type === "running"
      ? "Thinking..."
      : status.type === "requires-action"
        ? "Awaiting action"
        : "Incomplete";

  return <div className="mt-2 text-xs text-white/40">{label}</div>;
};

const MessageContainer = ({
  role,
  children,
}: {
  role: "assistant" | "user" | "system";
  children: ReactNode;
}) => {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2",
        isUser ? "items-end" : "items-start"
      )}
    >
      <div
        className={cn(
          "w-full max-w-[520px] rounded-2xl border px-4 py-3 shadow-sm",
          isUser
            ? "border-white/20 bg-white/15 text-white"
            : "border-white/10 bg-white/5 text-white/90"
        )}
      >
        {children}
      </div>
    </div>
  );
};

export const UserMessage = () => {
  const role = useMessage((state) => state.role);

  return (
    <MessageContainer role={role}>
      <MessagePrimitive.Parts
        components={{
          Text: () => (
            <MarkdownTextPrimitive
              className="text-sm leading-relaxed text-white"
              remarkPlugins={[remarkGfm]}
            />
          ),
          Reasoning: () => null,
        }}
      />
    </MessageContainer>
  );
};

export const AssistantMessage = () => {
  const role = useMessage((state) => state.role);
  const content = useMessage((state) => state.content);
  const hasToolParts = content.some((part) => part.type === "tool-call");

  return (
    <MessageContainer role={role}>
      <MessagePrimitive.Unstable_PartsGrouped
        groupingFunction={groupTextParts}
        components={{
          Text: MarkdownText,
          Reasoning: () => null,
          tools: {
            Fallback: ({ toolName }) => (
              <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white/70">
                Tool call received: {toolName}
              </div>
            ),
          },
          Group: MessageGroup,
        }}
      />
      {hasToolParts ? (
        <div className="text-xs uppercase tracking-[0.2em] text-white/40">
          Tool output
        </div>
      ) : null}
      <MessageStatus />
    </MessageContainer>
  );
};
