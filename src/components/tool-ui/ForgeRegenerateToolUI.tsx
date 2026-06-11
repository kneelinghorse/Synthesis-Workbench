"use client";

import {
  makeAssistantToolUI,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { useEffect, useRef, useState } from "react";

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
import { resolveDocumentToolStatus } from "@/components/tool-ui/DocumentToolUI";
import {
  uiSchemaToDesignDocument,
  type UiSchemaConversionResult,
} from "@/lib/engine/foundry-compose-adapter";
import {
  getFoundryMcpClient,
  type FoundryDesignComposeOutput,
} from "@/lib/mcp/foundry-client";
import {
  FORGE_REGENERATE_TOOL_NAME,
  collectExpectedRegenerateAnchors,
  confirmForgeRegenerate,
  forgeRegenerateCommentLink,
  reconcileAnchorsAfterRegenerate,
  rejectForgeRegenerate,
  type ForgeRegenerateAgentToolArgs,
  type ForgeRegenerateToolArgs,
  type ForgeRegenerateToolResult,
} from "@/lib/runtime/tools/forge-regenerate-tools";
import {
  countComponents,
  countNodes,
} from "@/lib/runtime/tools/document-tools";
import { useCommentStateStore } from "@/lib/stores/comment-state";
import { useDocumentStateStore } from "@/lib/stores/document-state";

type ComposePhase =
  | { phase: "idle" }
  | { phase: "composing" }
  | {
      phase: "ready";
      compose: FoundryDesignComposeOutput;
      conversion: UiSchemaConversionResult;
    }
  | { phase: "error"; message: string };

type ReconcileSummary = {
  survived: number;
  repinned: number;
  orphaned: number;
};

const formatConfidence = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

/**
 * Suggest-and-confirm card for `forge_regenerate` (Option B, s21-m04).
 *
 * The agent sends an INTENT, not a document. The card composes it through
 * headless Forge (`design_compose`, dry-run — nothing applies), converts the
 * UiSchema into a DesignDocument, and surfaces Forge's own review signal
 * (per-slot selections + confidence, low-confidence slots, conversion
 * warnings) so the human reviews the REAL composition before Accept. Accept
 * reuses the set_document apply path (decision 117), resolves the declared
 * comments (decision 122), then reconciles every still-open comment's anchor
 * against the regenerated document — re-pinning to durable entity-slot
 * anchors where unambiguous (decision 119), orphaning conservatively
 * otherwise (decision 141).
 */
const ForgeRegenerateToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<
  ForgeRegenerateAgentToolArgs,
  ForgeRegenerateToolResult
>) => {
  const decidedRef = useRef(false);
  const composeStartedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [composeState, setComposeState] = useState<ComposePhase>({
    phase: "idle",
  });
  const [reconcile, setReconcile] = useState<ReconcileSummary | null>(null);

  const currentRevision = useDocumentStateStore((state) => state.revision);
  const proposedRevisionRef = useRef<number | null>(null);
  if (proposedRevisionRef.current === null) {
    proposedRevisionRef.current = currentRevision;
  }

  const resolved = Boolean(result);
  const decision = result?.decision;
  const title = args?.title ?? "Regenerate via Forge";
  const prompt = args?.prompt ?? "Compose a fresh document from intent via headless Forge.";
  const errors = result?.errors ?? [];
  const intent = args?.intent;
  const argsFinal = status.type !== "running";
  const changedSinceProposed =
    !resolved && proposedRevisionRef.current !== currentRevision;

  // Compose once the args have finished streaming. Dry-run and read-only:
  // nothing touches the document store until the human accepts.
  useEffect(() => {
    if (composeStartedRef.current || resolved || !argsFinal || !intent) {
      return;
    }
    composeStartedRef.current = true;
    let cancelled = false;
    setComposeState({ phase: "composing" });
    (async () => {
      try {
        const compose = await getFoundryMcpClient().designCompose({
          intent,
          layout: args?.layout,
        });
        const conversion = uiSchemaToDesignDocument(compose.schema, {
          title: args?.title ?? intent,
        });
        if (!cancelled) {
          setComposeState({ phase: "ready", compose, conversion });
        }
      } catch (error) {
        if (!cancelled) {
          setComposeState({
            phase: "error",
            message:
              error instanceof Error ? error.message : "Forge compose failed.",
          });
        }
      }
    })();
    return () => {
      // Reset the start guard too: under StrictMode's mount->cleanup->mount
      // the ref would otherwise stay true while `cancelled` discards the
      // in-flight result, stranding the card at "Composing…" forever.
      cancelled = true;
      composeStartedRef.current = false;
    };
  }, [argsFinal, intent, args?.layout, args?.title, resolved]);

  const ready = composeState.phase === "ready" ? composeState : null;
  const composedDoc = ready?.conversion.document;

  const decide = async (accept: boolean) => {
    if (decidedRef.current || !args) {
      return;
    }
    decidedRef.current = true;
    if (!accept) {
      addResult(rejectForgeRegenerate());
      return;
    }
    if (!composedDoc) {
      decidedRef.current = false;
      return;
    }
    setBusy(true);
    const regenArgs: ForgeRegenerateToolArgs = {
      requestId: args.requestId,
      title: args.title,
      prompt: args.prompt,
      document: composedDoc,
      addressesCommentIds: args.addressesCommentIds ?? [],
    };
    const outcome = await confirmForgeRegenerate(regenArgs);
    addResult(outcome);
    // Resolve the comments the agent declared — the only linkage a full
    // regenerate has (decision 122; null link if the apply didn't take).
    const link = forgeRegenerateCommentLink(regenArgs, outcome);
    if (link) {
      useCommentStateStore.getState().resolveCommentsForChange(link);
    }
    if (outcome.saved) {
      // Reconcile every STILL-open comment against the regenerated document's
      // anchors: re-pin unambiguous matches to durable entity-slot anchors
      // (decision 119), leave the rest orphaned-but-open (decision 141).
      const commentStore = useCommentStateStore.getState();
      const open = commentStore.comments.filter((comment) => !comment.resolved);
      const reconciliations = reconcileAnchorsAfterRegenerate(
        open,
        collectExpectedRegenerateAnchors(composedDoc),
      );
      const repins = reconciliations.filter((entry) => entry.status === "repinned");
      if (repins.length > 0) {
        commentStore.reanchorComments(
          repins.map((entry) => ({
            commentId: entry.commentId,
            anchor: entry.anchor,
          })),
        );
      }
      setReconcile({
        survived: reconciliations.filter((entry) => entry.status === "survived").length,
        repinned: repins.length,
        orphaned: reconciliations.filter((entry) => entry.status === "orphaned").length,
      });
    }
  };

  const statusTone = resolveDocumentToolStatus({
    runtimeStatus: status.type,
    resolved,
    isError: isError ?? false,
    hasErrors: errors.length > 0 || composeState.phase === "error",
  });
  const displayTone: ToolOutputStatusTone =
    resolved && decision === "rejected" ? "incomplete" : statusTone;

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>
            Proposed change · Forge regenerate
          </ToolOutputCardEyebrow>
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
            {intent ? <div>Intent: {intent}</div> : null}
            {args?.layout ? <div>Layout: {args.layout}</div> : null}
            {composeState.phase === "composing" ? (
              <div>Composing via headless Forge…</div>
            ) : null}
            {ready ? (
              <>
                <div>
                  Composed: {countNodes(ready.conversion.document.root)} nodes |{" "}
                  {countComponents(ready.conversion.document.root)} components
                  {ready.compose.layout ? ` | ${ready.compose.layout}` : ""}
                </div>
                {ready.compose.selections.length > 0 ? (
                  <div className="space-y-0.5">
                    {ready.compose.selections.map((selection) => (
                      <div key={selection.slotName ?? selection.explanation ?? ""}>
                        {selection.slotName ?? "slot"}: {selection.selectedComponent ?? "?"}{" "}
                        ({formatConfidence(selection.confidence)})
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            {resolved && decision === "applied" ? (
              <div>
                Nodes: {result?.nodeCount ?? 0} | Components:{" "}
                {result?.componentCount ?? 0}
              </div>
            ) : null}
          </div>
        </ToolOutputCardMeta>

        {!resolved && ready && ready.compose.lowConfidenceSlotNames.length > 0 ? (
          <ToolOutputCardCallout tone="warning">
            Low-confidence slot pick{ready.compose.lowConfidenceSlotNames.length === 1 ? "" : "s"}:{" "}
            {ready.compose.lowConfidenceSlotNames.join(", ")} — review before applying.
          </ToolOutputCardCallout>
        ) : null}

        {!resolved && ready && ready.conversion.warnings.length > 0 ? (
          <ToolOutputCardCallout tone="warning">
            {ready.conversion.warnings.join(" ")}
          </ToolOutputCardCallout>
        ) : null}

        {composeState.phase === "error" ? (
          <ToolOutputCardCallout tone="danger">
            Forge compose failed: {composeState.message}
          </ToolOutputCardCallout>
        ) : null}

        {isError || errors.length > 0 ? (
          <ToolOutputCardCallout tone="danger">
            {errors.length > 0 ? errors.join(" ") : "Tool error reported."}
          </ToolOutputCardCallout>
        ) : null}

        {resolved && decision === "applied" && errors.length === 0 ? (
          <ToolOutputCardCallout tone="success">
            Applied. Preview rendering the regenerated composition.
            {reconcile
              ? ` Comments: ${reconcile.survived} survived, ${reconcile.repinned} re-pinned, ${reconcile.orphaned} orphaned.`
              : ""}
          </ToolOutputCardCallout>
        ) : null}

        {resolved && decision === "applied" && reconcile && reconcile.orphaned > 0 ? (
          <ToolOutputCardCallout tone="warning">
            {reconcile.orphaned} open comment{reconcile.orphaned === 1 ? "" : "s"} could not be
            re-anchored and {reconcile.orphaned === 1 ? "is" : "are"} flagged as detached —
            they were NOT resolved.
          </ToolOutputCardCallout>
        ) : null}

        {resolved && decision === "rejected" ? (
          <ToolOutputCardCallout tone="neutral">
            Discarded — the document was not changed.
          </ToolOutputCardCallout>
        ) : null}

        {!resolved && argsFinal && !intent ? (
          <ToolOutputCardCallout tone="warning">
            No intent provided in the tool call — nothing to compose.
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
            Review Forge&apos;s composition, then apply or discard.
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
              disabled={busy || !composedDoc}
            >
              {busy ? "Applying…" : "Accept"}
            </Button>
          </div>
        </ToolOutputCardFooter>
      ) : null}
    </ToolOutputCard>
  );
};

export const ForgeRegenerateToolUI = makeAssistantToolUI<
  ForgeRegenerateAgentToolArgs,
  ForgeRegenerateToolResult
>({
  toolName: FORGE_REGENERATE_TOOL_NAME,
  render: ForgeRegenerateToolCard,
});
