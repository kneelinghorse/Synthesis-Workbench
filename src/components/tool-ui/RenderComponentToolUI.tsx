"use client";

import { makeAssistantToolUI, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { useEffect, useRef } from "react";

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
  RENDER_COMPONENT_TOOL_NAME,
  renderComponent,
  type RenderComponentToolArgs,
  type RenderComponentToolResult,
} from "@/lib/runtime/tools/oods-tools";

const RenderComponentToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<
  RenderComponentToolArgs,
  RenderComponentToolResult
>) => {
  const execTriggered = useRef(false);

  const resolved = Boolean(result);
  const schema = args?.schema;

  const requestId = args?.requestId ?? "unknown";
  const title = args?.title ?? "Render component";
  const prompt =
    args?.prompt ?? "Render a component preview using the Foundry MCP.";

  // Auto-execute on mount
  useEffect(() => {
    if (execTriggered.current || resolved || isError || !args?.schema) {
      return;
    }
    execTriggered.current = true;

    let cancelled = false;
    const run = async () => {
      const execResult = await renderComponent(args);
      if (!cancelled) {
        addResult(execResult);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [addResult, args, isError, resolved]);

  const warnings = result?.warnings ?? [];
  const errors = result?.errors ?? [];

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Foundry Render</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={status.type} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>Request ID: {requestId}</div>
            <div>Status: {resolved ? "Complete" : "Ready"}</div>
            <div>Warnings: {warnings.length}</div>
          </div>
        </ToolOutputCardMeta>

        {isError ? (
          <ToolOutputCardCallout tone="danger">
            Tool error reported.
          </ToolOutputCardCallout>
        ) : null}

        {errors.length > 0 ? (
          <ToolOutputCardCallout tone="danger" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-red-100/70">
              Render failed
            </div>
            <div className="text-sm font-medium text-red-50">
              {errors.join(" ")}
            </div>
          </ToolOutputCardCallout>
        ) : null}

        {warnings.length > 0 ? (
          <ToolOutputCardCallout tone="warning" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-amber-100/70">
              Warnings
            </div>
            <div className="space-y-1 text-xs text-amber-100/70">
              {warnings.map((warning, index) => (
                <div key={`${warning}-${index}`}>{warning}</div>
              ))}
            </div>
          </ToolOutputCardCallout>
        ) : null}

        {!schema ? (
          <ToolOutputCardCallout tone="warning">
            No UI schema provided. Pass a JSON schema after <code>/render</code>{" "}
            to generate a preview.
          </ToolOutputCardCallout>
        ) : null}
      </ToolOutputCardBody>
    </ToolOutputCard>
  );
};

export const RenderComponentToolUI = makeAssistantToolUI<
  RenderComponentToolArgs,
  RenderComponentToolResult
>({
  toolName: RENDER_COMPONENT_TOOL_NAME,
  render: RenderComponentToolCard,
});
