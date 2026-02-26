"use client";

import {
  makeAssistantToolUI,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
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
  type ToolOutputStatusTone,
} from "@/components/tool-ui/ToolOutputCard";
import {
  SET_DOCUMENT_TOOL_NAME,
  PATCH_NODE_TOOL_NAME,
  executeSetDocument,
  executePatchNode,
  type SetDocumentToolArgs,
  type SetDocumentToolResult,
  type PatchNodeToolArgs,
  type PatchNodeToolResult,
} from "@/lib/runtime/tools/document-tools";

export const resolveDocumentToolStatus = (params: {
  runtimeStatus: string;
  resolved: boolean;
  isError: boolean;
  hasErrors: boolean;
}): ToolOutputStatusTone => {
  const { runtimeStatus, resolved, isError, hasErrors } = params;

  if (isError || hasErrors) {
    return "error";
  }

  if (resolved) {
    return "complete";
  }

  if (
    runtimeStatus === "running" ||
    runtimeStatus === "requires-action" ||
    runtimeStatus === "complete" ||
    runtimeStatus === "incomplete" ||
    runtimeStatus === "error"
  ) {
    return runtimeStatus;
  }

  return "running";
};

// ============================================================================
// SetDocument Tool UI
// ============================================================================

const SetDocumentToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<SetDocumentToolArgs, SetDocumentToolResult>) => {
  const execTriggered = useRef(false);

  const resolved = Boolean(result);
  const title = args?.title ?? "Set document";
  const prompt = args?.prompt ?? "Create or update the active design document.";

  // Auto-execute on mount
  useEffect(() => {
    if (execTriggered.current || resolved || isError || !args?.document) {
      return;
    }
    execTriggered.current = true;

    let cancelled = false;
    const run = async () => {
      const execResult = await executeSetDocument(args);
      if (!cancelled) {
        addResult(execResult);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [addResult, args, isError, resolved]);

  const errors = result?.errors ?? [];
  const nodeCount = result?.nodeCount ?? 0;
  const componentCount = result?.componentCount ?? 0;
  const statusTone = resolveDocumentToolStatus({
    runtimeStatus: status.type,
    resolved,
    isError,
    hasErrors: errors.length > 0,
  });

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Document Author</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={statusTone} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>
              Status: {resolved ? "Complete" : "Processing"}
            </div>
            {result?.slug && <div>Slug: {result.slug}</div>}
            {result?.projectSlug && <div>Project: {result.projectSlug}</div>}
            <div>
              Nodes: {nodeCount} | Components: {componentCount}
            </div>
            {result?.persisted && <div>Persisted to YAML</div>}
            {result?.persistedPath && <div>Path: {result.persistedPath}</div>}
          </div>
        </ToolOutputCardMeta>

        {isError || errors.length > 0 ? (
          <ToolOutputCardCallout tone="danger">
            {errors.length > 0
              ? errors.join(" ")
              : "Tool error reported."}
          </ToolOutputCardCallout>
        ) : null}

        {resolved && !isError && errors.length === 0 ? (
          <ToolOutputCardCallout tone="success">
            Document set as active. Preview rendering composition.
          </ToolOutputCardCallout>
        ) : null}

        {!args?.document ? (
          <ToolOutputCardCallout tone="warning">
            No document provided. Pass a document JSON in the tool call.
          </ToolOutputCardCallout>
        ) : null}
      </ToolOutputCardBody>
    </ToolOutputCard>
  );
};

export const SetDocumentToolUI = makeAssistantToolUI<
  SetDocumentToolArgs,
  SetDocumentToolResult
>({
  toolName: SET_DOCUMENT_TOOL_NAME,
  render: SetDocumentToolCard,
});

// ============================================================================
// PatchNode Tool UI
// ============================================================================

const PatchNodeToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<PatchNodeToolArgs, PatchNodeToolResult>) => {
  const execTriggered = useRef(false);
  const resolved = Boolean(result);
  const title = args?.title ?? "Patch node";
  const prompt = args?.prompt ?? "Modify a component node by ID.";

  // Auto-execute on mount
  useEffect(() => {
    if (execTriggered.current || resolved || isError || !args?.nodeId) {
      return;
    }
    execTriggered.current = true;

    const execResult = executePatchNode(args);
    addResult(execResult);
  }, [addResult, args, isError, resolved]);

  const errors = result?.errors ?? [];
  const statusTone = resolveDocumentToolStatus({
    runtimeStatus: status.type,
    resolved,
    isError,
    hasErrors: errors.length > 0,
  });

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Node Patch</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={statusTone} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>Node ID: {args?.nodeId ?? "unknown"}</div>
            <div>Status: {resolved ? "Complete" : "Processing"}</div>
          </div>
        </ToolOutputCardMeta>

        {isError || errors.length > 0 ? (
          <ToolOutputCardCallout tone="danger">
            {errors.length > 0 ? errors.join(" ") : "Tool error reported."}
          </ToolOutputCardCallout>
        ) : null}

        {resolved && !isError && errors.length === 0 ? (
          <ToolOutputCardCallout tone="success">
            Node &quot;{result?.nodeId}&quot; patched. Preview re-rendering.
          </ToolOutputCardCallout>
        ) : null}
      </ToolOutputCardBody>
    </ToolOutputCard>
  );
};

export const PatchNodeToolUI = makeAssistantToolUI<
  PatchNodeToolArgs,
  PatchNodeToolResult
>({
  toolName: PATCH_NODE_TOOL_NAME,
  render: PatchNodeToolCard,
});
