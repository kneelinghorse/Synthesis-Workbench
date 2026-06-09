"use client";

import {
  makeAssistantToolUI,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
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
  type ToolOutputStatusTone,
} from "@/components/tool-ui/ToolOutputCard";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import {
  SET_DOCUMENT_TOOL_NAME,
  PATCH_NODE_TOOL_NAME,
  confirmSetDocument,
  rejectSetDocument,
  confirmPatchNode,
  rejectPatchNode,
  countNodes,
  countComponents,
  findNodeById,
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

const formatPropValue = (value: unknown): string => {
  if (value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  const serialized = JSON.stringify(value);
  return serialized.length > 80 ? `${serialized.slice(0, 77)}…` : serialized;
};

// ============================================================================
// SetDocument Tool UI — suggest-and-confirm (no auto-apply)
// ============================================================================

const SetDocumentToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<SetDocumentToolArgs, SetDocumentToolResult>) => {
  const decidedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const currentRevision = useDocumentStateStore((state) => state.revision);
  const proposedRevisionRef = useRef<number | null>(null);
  if (proposedRevisionRef.current === null) {
    proposedRevisionRef.current = currentRevision;
  }

  const resolved = Boolean(result);
  const decision = result?.decision;
  const title = args?.title ?? "Set document";
  const prompt = args?.prompt ?? "Replace the active design document.";
  const errors = result?.errors ?? [];
  // Require a well-formed root — countNodes(undefined) would throw on render.
  const doc = args?.document;
  const hasDocument = Boolean(doc?.root);
  const proposedNodes = doc?.root ? countNodes(doc.root) : 0;
  const proposedComponents = doc?.root ? countComponents(doc.root) : 0;
  const changedSinceProposed =
    !resolved && proposedRevisionRef.current !== currentRevision;

  const decide = async (accept: boolean) => {
    if (decidedRef.current || !args) {
      return;
    }
    decidedRef.current = true;
    if (accept) {
      setBusy(true);
      addResult(await confirmSetDocument(args));
    } else {
      addResult(rejectSetDocument());
    }
  };

  const statusTone = resolveDocumentToolStatus({
    runtimeStatus: status.type,
    resolved,
    isError: isError ?? false,
    hasErrors: errors.length > 0,
  });
  const displayTone: ToolOutputStatusTone =
    resolved && decision === "rejected" ? "incomplete" : statusTone;

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Proposed change · Document</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus
          status={displayTone}
          label={resolved && decision === "rejected" ? "Rejected" : undefined}
        />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            {resolved ? (
              <>
                <div>
                  Nodes: {result?.nodeCount ?? 0} | Components:{" "}
                  {result?.componentCount ?? 0}
                </div>
                {result?.slug && <div>Slug: {result.slug}</div>}
                {result?.projectSlug && <div>Project: {result.projectSlug}</div>}
                {result?.persisted && <div>Persisted to YAML</div>}
                {result?.persistedPath && <div>Path: {result.persistedPath}</div>}
              </>
            ) : (
              <div>
                Replaces the document — {proposedNodes} nodes,{" "}
                {proposedComponents} components.
              </div>
            )}
          </div>
        </ToolOutputCardMeta>

        {isError || errors.length > 0 ? (
          <ToolOutputCardCallout tone="danger">
            {errors.length > 0 ? errors.join(" ") : "Tool error reported."}
          </ToolOutputCardCallout>
        ) : null}

        {resolved && decision === "applied" && errors.length === 0 ? (
          <ToolOutputCardCallout tone="success">
            Applied. Preview rendering the new composition.
          </ToolOutputCardCallout>
        ) : null}

        {resolved && decision === "rejected" ? (
          <ToolOutputCardCallout tone="neutral">
            Discarded — the document was not changed.
          </ToolOutputCardCallout>
        ) : null}

        {!resolved && !hasDocument ? (
          <ToolOutputCardCallout tone="warning">
            No document provided in the tool call — nothing to apply.
          </ToolOutputCardCallout>
        ) : null}

        {changedSinceProposed ? (
          <ToolOutputCardCallout tone="warning">
            The document changed after this was proposed — applying will replace
            the current state.
          </ToolOutputCardCallout>
        ) : null}
      </ToolOutputCardBody>

      {!resolved && !isError ? (
        <ToolOutputCardFooter>
          <span className="text-xs text-white/50">
            Review the proposed change, then apply or discard.
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => decide(false)}
              disabled={busy}
            >
              Reject
            </Button>
            <Button
              size="sm"
              onClick={() => decide(true)}
              disabled={busy || !hasDocument}
            >
              {busy ? "Applying…" : "Accept"}
            </Button>
          </div>
        </ToolOutputCardFooter>
      ) : null}
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
// PatchNode Tool UI — suggest-and-confirm with a prop diff (no auto-apply)
// ============================================================================

const PatchNodeToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<PatchNodeToolArgs, PatchNodeToolResult>) => {
  const decidedRef = useRef(false);

  // Resolve the target's CURRENT props from the live document so the card can
  // render a real before -> after diff. Re-resolves if the document changes.
  const currentNode = useDocumentStateStore((state) =>
    args?.nodeId && state.document
      ? findNodeById(state.document.root, args.nodeId)
      : null,
  );
  const currentRevision = useDocumentStateStore((state) => state.revision);
  const proposedRevisionRef = useRef<number | null>(null);
  if (proposedRevisionRef.current === null) {
    proposedRevisionRef.current = currentRevision;
  }

  const resolved = Boolean(result);
  const decision = result?.decision;
  const title = args?.title ?? "Patch node";
  const prompt = args?.prompt ?? "Modify a component node by id.";
  const errors = result?.errors ?? [];
  const changedSinceProposed =
    !resolved && proposedRevisionRef.current !== currentRevision;

  const propRows = args?.props
    ? Object.entries(args.props).map(([key, to]) => ({
        key,
        from: currentNode?.props?.[key],
        to,
      }))
    : [];
  const refChange =
    args?.ref && currentNode && args.ref !== currentNode.ref
      ? { from: currentNode.ref, to: args.ref }
      : null;
  const targetFound = Boolean(currentNode);

  const decide = (accept: boolean) => {
    if (decidedRef.current || !args) {
      return;
    }
    decidedRef.current = true;
    addResult(accept ? confirmPatchNode(args) : rejectPatchNode(args));
  };

  const statusTone = resolveDocumentToolStatus({
    runtimeStatus: status.type,
    resolved,
    isError: isError ?? false,
    hasErrors: errors.length > 0,
  });
  const displayTone: ToolOutputStatusTone =
    resolved && decision === "rejected" ? "incomplete" : statusTone;

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Proposed change · Node</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus
          status={displayTone}
          label={resolved && decision === "rejected" ? "Rejected" : undefined}
        />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>Node ID: {args?.nodeId ?? "unknown"}</div>
            {refChange ? (
              <div>
                ref: {refChange.from} → {refChange.to}
              </div>
            ) : null}
            {propRows.length > 0 ? (
              <div className="space-y-0.5">
                {propRows.map((row) => (
                  <div key={row.key}>
                    {row.key}: {formatPropValue(row.from)} →{" "}
                    {formatPropValue(row.to)}
                  </div>
                ))}
              </div>
            ) : refChange ? null : (
              <div>No prop changes specified.</div>
            )}
          </div>
        </ToolOutputCardMeta>

        {isError || errors.length > 0 ? (
          <ToolOutputCardCallout tone="danger">
            {errors.length > 0 ? errors.join(" ") : "Tool error reported."}
          </ToolOutputCardCallout>
        ) : null}

        {resolved && decision === "applied" && errors.length === 0 ? (
          <ToolOutputCardCallout tone="success">
            Node &quot;{result?.nodeId}&quot; patched. Preview re-rendering.
          </ToolOutputCardCallout>
        ) : null}

        {resolved && decision === "rejected" ? (
          <ToolOutputCardCallout tone="neutral">
            Discarded — node &quot;{args?.nodeId}&quot; was not changed.
          </ToolOutputCardCallout>
        ) : null}

        {!resolved && !targetFound ? (
          <ToolOutputCardCallout tone="warning">
            Node &quot;{args?.nodeId}&quot; isn&apos;t in the current document —
            nothing to patch.
          </ToolOutputCardCallout>
        ) : null}

        {changedSinceProposed && targetFound ? (
          <ToolOutputCardCallout tone="warning">
            The document changed after this was proposed — the diff above is the
            current state.
          </ToolOutputCardCallout>
        ) : null}
      </ToolOutputCardBody>

      {!resolved && !isError ? (
        <ToolOutputCardFooter>
          <span className="text-xs text-white/50">
            Review the diff, then apply or discard.
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => decide(false)}>
              Reject
            </Button>
            <Button
              size="sm"
              onClick={() => decide(true)}
              disabled={!targetFound}
            >
              Accept
            </Button>
          </div>
        </ToolOutputCardFooter>
      ) : null}
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
