"use client";

import {
  makeAssistantToolUI,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { useEffect, useMemo, useRef } from "react";

import {
  ToolOutputCard,
  ToolOutputCardBody,
  ToolOutputCardCallout,
  ToolOutputCardDescription,
  ToolOutputCardEyebrow,
  ToolOutputCardHeader,
  ToolOutputCardHeading,
  ToolOutputCardMeta,
  ToolOutputCardStatus,
  ToolOutputCardTitle,
} from "@/components/tool-ui/ToolOutputCard";
import {
  SET_DATA_CONTEXT_TOOL_NAME,
  executeSetDataContext,
  type SetDataContextToolArgs,
  type SetDataContextToolResult,
} from "@/lib/runtime/tools/document-tools";

const formatDataValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const SetDataContextToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<SetDataContextToolArgs, SetDataContextToolResult>) => {
  const execTriggered = useRef(false);

  const resolved = Boolean(result);
  const title = args?.title ?? "Set data context";
  const prompt =
    args?.prompt ?? "Apply runtime data bindings for composition rendering.";
  const entries = useMemo(
    () => Object.entries(args?.data ?? {}),
    [args?.data]
  );
  const errors = result?.errors ?? [];

  useEffect(() => {
    if (execTriggered.current || resolved || isError || !args?.data) {
      return;
    }
    execTriggered.current = true;

    const execResult = executeSetDataContext(args);
    addResult(execResult);
  }, [addResult, args, isError, resolved]);

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Data Context</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={status.type} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>Mode: {args?.merge ? "Merge" : "Replace"}</div>
            <div>Status: {resolved ? "Complete" : "Processing"}</div>
            <div>Keys: {result?.keyCount ?? entries.length}</div>
          </div>
        </ToolOutputCardMeta>

        {entries.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
            {entries.map(([key, value]) => (
              <div key={key} className="text-xs text-white/80">
                <span className="font-mono text-white">{key}</span>:{" "}
                <span className="font-mono text-white/70">{formatDataValue(value)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {isError || errors.length > 0 ? (
          <ToolOutputCardCallout tone="danger">
            {errors.length > 0 ? errors.join(" ") : "Tool error reported."}
          </ToolOutputCardCallout>
        ) : null}

        {resolved && !isError && errors.length === 0 ? (
          <ToolOutputCardCallout tone="success">
            Data context updated. Preview bindings will re-render with the latest values.
          </ToolOutputCardCallout>
        ) : null}

        {!args?.data ? (
          <ToolOutputCardCallout tone="warning">
            No data payload provided. Pass a JSON object to set runtime data context.
          </ToolOutputCardCallout>
        ) : null}
      </ToolOutputCardBody>
    </ToolOutputCard>
  );
};

export const SetDataContextToolUI = makeAssistantToolUI<
  SetDataContextToolArgs,
  SetDataContextToolResult
>({
  toolName: SET_DATA_CONTEXT_TOOL_NAME,
  render: SetDataContextToolCard,
});
