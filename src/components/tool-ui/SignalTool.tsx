"use client";

import { makeAssistantToolUI, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { useMemo, useState } from "react";

import {
  ToolOutputCard,
  ToolOutputCardBody,
  ToolOutputCardCallout,
  ToolOutputCardDescription,
  ToolOutputCardEyebrow,
  ToolOutputCardFooter,
  ToolOutputCardHeader,
  ToolOutputCardHeading,
  ToolOutputCardMeta,
  ToolOutputCardStatus,
  ToolOutputCardTitle,
  type ToolOutputCalloutTone,
} from "@/components/tool-ui/ToolOutputCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SIGNAL_SET,
  SIGNAL_TOOL_NAME,
  type SignalDefinition,
  type SignalToolArgs,
  type SignalToolResult,
  type SignalTone,
} from "@/lib/runtime/tools/signal-tool";

const signalCalloutTones: Record<SignalTone, ToolOutputCalloutTone> = {
  green: "success",
  yellow: "warning",
  red: "danger",
};

const signalButtonStyles: Record<SignalTone, string> = {
  green: "border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/10",
  yellow: "border-amber-400/40 text-amber-100 hover:bg-amber-500/10",
  red: "border-rose-400/40 text-rose-100 hover:bg-rose-500/10",
};

const resolveSignals = (signals?: SignalDefinition[]) =>
  signals?.length ? signals : DEFAULT_SIGNAL_SET;

const SignalToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<SignalToolArgs, SignalToolResult>) => {
  const [note, setNote] = useState("");
  const resolved = Boolean(result);

  const requestMeta = useMemo(() => {
    const signals = resolveSignals(args?.signals);
    return {
      requestId: args?.requestId ?? "unknown",
      title: args?.title ?? "Status signal",
      prompt:
        args?.prompt ??
        "Capture a quick signal that summarizes the current state.",
      signals,
    };
  }, [args?.prompt, args?.requestId, args?.signals, args?.title]);

  const resolvedSignal = resolved
    ? requestMeta.signals.find((signal) => signal.id === result?.signal)
    : null;

  const submitSignal = (signal: SignalTone) => {
    if (resolved) return;
    addResult({
      signal,
      note: note.trim() || undefined,
      resolvedAt: new Date().toISOString(),
    });
  };

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Signal Tool</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{requestMeta.title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{requestMeta.prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={status.type} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>Request ID: {requestMeta.requestId}</ToolOutputCardMeta>
        {isError ? (
          <ToolOutputCardCallout tone="danger">
            Tool error reported.
          </ToolOutputCardCallout>
        ) : null}
        {resolved ? (
          <ToolOutputCardCallout
            tone={signalCalloutTones[result?.signal ?? "green"]}
            className="space-y-2"
          >
            <div className="text-xs uppercase tracking-[0.2em] text-white/60">
              Signal captured
            </div>
            <div className="text-sm font-medium">
              {resolvedSignal?.label ?? result?.signal}
            </div>
            {result?.note ? (
              <div className="text-xs text-white/70">{result.note}</div>
            ) : null}
            <div className="text-xs text-white/50">
              Resolved at {result?.resolvedAt}
            </div>
          </ToolOutputCardCallout>
        ) : (
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add any context or nuance..."
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/10"
          />
        )}
      </ToolOutputCardBody>

      {resolved || isError ? null : (
        <ToolOutputCardFooter>
          <span className="text-xs text-white/50">Select a signal to continue.</span>
          <div className="flex flex-wrap gap-2">
            {requestMeta.signals.map((signal) => (
              <Button
                key={signal.id}
                type="button"
                size="sm"
                variant="outline"
                className={cn(signalButtonStyles[signal.id])}
                onClick={() => submitSignal(signal.id)}
              >
                {signal.label}
              </Button>
            ))}
          </div>
        </ToolOutputCardFooter>
      )}
    </ToolOutputCard>
  );
};

export const SignalToolUI = makeAssistantToolUI<SignalToolArgs, SignalToolResult>({
  toolName: SIGNAL_TOOL_NAME,
  render: SignalToolCard,
});
