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
} from "@/components/tool-ui/ToolOutputCard";
import { Button } from "@/components/ui/button";
import {
  DEMO_TOOL_NAME,
  type DemoToolArgs,
  type DemoToolResult,
} from "@/lib/runtime/tools/demo-tool";

const DemoToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<DemoToolArgs, DemoToolResult>) => {
  const [notes, setNotes] = useState("");
  const resolved = Boolean(result);

  const requestMeta = useMemo(
    () => ({
      requestId: args?.requestId ?? "unknown",
      title: args?.title ?? "Tool UI Demo",
      description: args?.description ?? "Confirm tool UI wiring.",
    }),
    [args?.description, args?.requestId, args?.title]
  );

  const submitResult = () => {
    if (!notes.trim()) return;
    addResult({
      acknowledged: true,
      notes: notes.trim(),
      resolvedAt: new Date().toISOString(),
    });
  };

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Demo Tool</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{requestMeta.title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>
            {requestMeta.description}
          </ToolOutputCardDescription>
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
          <ToolOutputCardCallout tone="success" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-100/70">
              Result captured
            </div>
            <div className="font-medium">{result?.notes}</div>
            <div className="text-xs text-emerald-100/60">
              Resolved at {result?.resolvedAt}
            </div>
          </ToolOutputCardCallout>
        ) : (
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add approval notes..."
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/10"
          />
        )}
      </ToolOutputCardBody>

      {resolved ? null : (
        <ToolOutputCardFooter>
          <span className="text-xs text-white/50">
            Submit a tool result to continue.
          </span>
          <Button
            type="button"
            size="sm"
            className="bg-white text-black hover:bg-white/90"
            disabled={!notes.trim()}
            onClick={submitResult}
          >
            Confirm result
          </Button>
        </ToolOutputCardFooter>
      )}
    </ToolOutputCard>
  );
};

export const DemoToolUI = makeAssistantToolUI<DemoToolArgs, DemoToolResult>({
  toolName: DEMO_TOOL_NAME,
  render: DemoToolCard,
});
