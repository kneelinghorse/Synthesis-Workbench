"use client";

import { makeAssistantToolUI, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  TOKEN_ADJUSTMENT_TOOL_NAME,
  buildTokenChangeSummary,
  type TokenAdjustmentToolArgs,
  type TokenAdjustmentToolResult,
} from "@/lib/runtime/tools/token-tools";
import {
  type TokenResetSource,
  type TokenValueSource,
  useTokenStateStore,
} from "@/lib/stores/token-state";
import type { TokenState } from "@/types/token-state";
import { cn } from "@/lib/utils";

const SOURCE_LABELS: Record<TokenResetSource, string> = {
  canonical: "Foundry canonical",
  stage1: "Stage1 suggestion",
  manual: "Manual override",
  default: "Default token",
};

const SOURCE_STATE_LABELS: Record<string, string> = {
  default: "Default",
  import: "Foundry canonical",
  stage1: "Stage1 suggestion",
  manual: "Manual override",
  migration: "Migration",
  system: "System",
};

const TokenAdjustmentToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<TokenAdjustmentToolArgs, TokenAdjustmentToolResult>) => {
  const tokens = useTokenStateStore((state) => state.tokens);
  const setTokens = useTokenStateStore((state) => state.setTokens);
  const annotations = useTokenStateStore((state) => state.annotations);
  const setTokenAnnotation = useTokenStateStore(
    (state) => state.setTokenAnnotation
  );
  const getTokenAttribution = useTokenStateStore(
    (state) => state.getTokenAttribution
  );
  const resetTokenToSource = useTokenStateStore(
    (state) => state.resetTokenToSource
  );
  const resolved = Boolean(result);
  const [annotationDrafts, setAnnotationDrafts] = useState<Record<string, string>>(
    {}
  );

  const baseTokensRef = useRef<TokenState | null>(null);
  if (!baseTokensRef.current) {
    baseTokensRef.current = tokens;
  }

  const changes = args?.changes ?? {};

  const { entries, invalidPaths, validChanges } = useMemo(
    () => buildTokenChangeSummary(baseTokensRef.current ?? tokens, changes),
    [changes, tokens]
  );

  const attributionByPath = useMemo(() => {
    const paths = entries.map((entry) => entry.path);
    return getTokenAttribution(paths).reduce<
      Record<string, ReturnType<typeof getTokenAttribution>[number]>
    >((acc, entry) => {
      acc[entry.path] = entry;
      return acc;
    }, {});
  }, [entries, getTokenAttribution]);

  const conflictCount = useMemo(
    () =>
      entries.filter((entry) => attributionByPath[entry.path]?.conflict).length,
    [attributionByPath, entries]
  );

  useEffect(() => {
    setAnnotationDrafts((current) => {
      const next = { ...current };
      let changed = false;

      for (const entry of entries) {
        if (next[entry.path] === undefined) {
          next[entry.path] = annotations[entry.path] ?? "";
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [annotations, entries]);

  const execTriggered = useRef(false);

  const requestId = args?.requestId ?? "unknown";
  const title = args?.title ?? "Token adjustments";
  const prompt =
    args?.prompt ?? "Review the proposed token updates and apply them to preview.";

  const applyChanges = useCallback(() => {
    if (resolved) return;
    if (!entries.length || invalidPaths.length > 0) return;

    setTokens(validChanges);
    addResult({
      applied: true,
      appliedCount: Object.keys(validChanges).length,
      invalidPaths,
      resolvedAt: new Date().toISOString(),
    });
  }, [addResult, entries.length, invalidPaths, resolved, setTokens, validChanges]);

  // Auto-execute on mount for agentic loop
  useEffect(() => {
    if (execTriggered.current || resolved || isError) return;
    if (!entries.length || invalidPaths.length > 0) return;
    execTriggered.current = true;
    applyChanges();
  }, [applyChanges, entries.length, invalidPaths.length, isError, resolved]);

  const handleResetToSource = (path: string, source: TokenValueSource) => {
    void resetTokenToSource(path, source);
  };

  const updateAnnotationDraft = (path: string, note: string) => {
    setAnnotationDrafts((current) => ({
      ...current,
      [path]: note,
    }));
  };

  const saveAnnotation = (path: string) => {
    const note = annotationDrafts[path] ?? "";
    setTokenAnnotation(path, note);
  };

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Token Adjustment</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={status.type} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>Request ID: {requestId}</div>
            <div>Preview: {resolved ? "Updated" : "Pending"}</div>
            <div>Changes: {entries.length}</div>
            <div>Precedence: Foundry canonical {"<"} Stage1 {"<"} manual</div>
            <div>Conflicts: {conflictCount}</div>
          </div>
        </ToolOutputCardMeta>

        {isError ? (
          <ToolOutputCardCallout tone="danger">
            Tool error reported.
          </ToolOutputCardCallout>
        ) : null}

        {resolved ? (
          <ToolOutputCardCallout tone="success" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-100/70">
              Tokens applied
            </div>
            <div className="text-sm font-medium text-emerald-50">
              {result?.appliedCount ?? 0} change
              {(result?.appliedCount ?? 0) === 1 ? "" : "s"} synced to preview
            </div>
            <div className="text-xs text-emerald-100/60">
              Resolved at {result?.resolvedAt}
            </div>
          </ToolOutputCardCallout>
        ) : null}

        {entries.length === 0 ? (
          <ToolOutputCardCallout tone="warning">
            No token changes provided. Add token paths and values to continue.
          </ToolOutputCardCallout>
        ) : null}

        {invalidPaths.length > 0 ? (
          <ToolOutputCardCallout tone="warning" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-amber-100/80">
              Invalid token paths
            </div>
            <div className="space-y-1 text-xs text-amber-100/70">
              {invalidPaths.map((path) => (
                <div key={path}>{path}</div>
              ))}
            </div>
          </ToolOutputCardCallout>
        ) : null}

        <div className="space-y-3">
          {entries.map((entry) => {
            const attribution = attributionByPath[entry.path];
            const sourceValues = attribution?.values ?? {};
            const sourceButtons = (
              ["canonical", "stage1", "manual"] as const
            ).filter(
              (source): source is TokenValueSource =>
                sourceValues[source] !== undefined
            );

            return (
              <div
                key={entry.path}
                className={cn(
                  "rounded-xl border border-white/10 bg-black/20 px-3 py-3",
                  entry.valid ? "text-white/80" : "border-amber-400/40 text-amber-100",
                  attribution?.conflict && "border-amber-400/50 bg-amber-500/5"
                )}
              >
                <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.2em]">
                  <span>{entry.path}</span>
                  <span>{entry.valid ? "Valid" : "Invalid"}</span>
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/50">
                  Active source:{" "}
                  {SOURCE_STATE_LABELS[attribution?.source ?? "default"] ?? "Unknown"}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                      Current
                    </div>
                    <div className="mt-1 break-all text-sm font-mono text-white/80">
                      {entry.from ?? "unset"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                      New
                    </div>
                    <div className="mt-1 break-all text-sm font-mono text-white">
                      {entry.to}
                    </div>
                  </div>
                </div>

                {attribution?.conflict ? (
                  <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-2 text-xs text-amber-100/90">
                    Conflict: {attribution.conflictingSources.join(", ")} disagree.
                  </div>
                ) : null}

                {sourceButtons.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                      Source values
                    </div>
                    {sourceButtons.map((source) => (
                      <div
                        key={`${entry.path}-${source}`}
                        className="rounded-lg border border-white/10 bg-black/30 px-2 py-2"
                      >
                        <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                          {SOURCE_LABELS[source]}
                        </div>
                        <div className="mt-1 break-all font-mono text-xs text-white/85">
                          {sourceValues[source]}
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      {sourceButtons.map((source) => (
                        <Button
                          key={`${entry.path}-${source}-button`}
                          type="button"
                          size="sm"
                          className="bg-white/10 text-white hover:bg-white/20"
                          onClick={() => handleResetToSource(entry.path, source)}
                        >
                          Use {SOURCE_LABELS[source]}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                    Annotation
                  </div>
                  <textarea
                    value={annotationDrafts[entry.path] ?? annotations[entry.path] ?? ""}
                    onChange={(event) =>
                      updateAnnotationDraft(entry.path, event.target.value)
                    }
                    placeholder="Why was this token value chosen?"
                    className="min-h-[68px] w-full rounded-lg border border-white/15 bg-black/30 px-2 py-2 text-xs text-white/90 outline-none focus:border-white/40"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                      {annotations[entry.path]
                        ? "Annotation saved"
                        : "No annotation saved"}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-white/10 text-white hover:bg-white/20"
                      onClick={() => saveAnnotation(entry.path)}
                    >
                      Save annotation
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ToolOutputCardBody>

      {resolved || isError ? null : (
        <ToolOutputCardFooter>
          <span className="text-xs text-white/50">
            Apply token updates to sync the preview.
          </span>
          <Button
            type="button"
            size="sm"
            className="bg-white text-black hover:bg-white/90"
            onClick={applyChanges}
            disabled={entries.length === 0 || invalidPaths.length > 0}
          >
            Apply updates
          </Button>
        </ToolOutputCardFooter>
      )}
    </ToolOutputCard>
  );
};

export const TokenAdjustmentToolUI = makeAssistantToolUI<
  TokenAdjustmentToolArgs,
  TokenAdjustmentToolResult
>({
  toolName: TOKEN_ADJUSTMENT_TOOL_NAME,
  render: TokenAdjustmentToolCard,
});
