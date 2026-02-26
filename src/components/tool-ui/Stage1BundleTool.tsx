"use client";

import { makeAssistantToolUI, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";

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
import { BundlePicker } from "@/components/workbench/BundlePicker";
import type { ProjectBundleAssociation } from "@/types/project-model";
import { formatMcpServiceError } from "@/lib/mcp/user-facing-errors";
import { type Stage1RunSummary } from "@/lib/mcp/stage1-client";
import { buildStage1BundleFromRun } from "@/lib/stage1/bundle-loader";
import { useProjectStateStore } from "@/lib/stores/project-state";
import { useStage1BundleStore } from "@/lib/stores/stage1-bundle";
import {
  LOAD_BUNDLE_TOOL_NAME,
  buildLoadBundleToolResult,
  type LoadBundleToolArgs,
  type LoadBundleToolResult,
} from "@/lib/runtime/tools/stage1-tools";
import type { Stage1BundlePayload } from "@/types/stage1-bundle";

const Stage1BundleToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<LoadBundleToolArgs, LoadBundleToolResult>) => {
  const loadBundle = useStage1BundleStore((state) => state.loadBundle);
  const componentCount = useStage1BundleStore(
    (state) => state.components.length
  );
  const tokenSuggestionCount = useStage1BundleStore(
    (state) => Object.keys(state.tokenSuggestions).length
  );

  const resolved = Boolean(result);
  const payload = args?.bundleJson ?? args?.bundle;
  const hasPayload = Boolean(payload);
  const activeProjectSlug = useProjectStateStore((state) => state.activeProjectSlug);
  const projectSlug = args?.projectSlug?.trim() || activeProjectSlug || "default";
  const requestId = args?.requestId ?? "unknown";
  const title = args?.title ?? "Stage1 bundle ingestion";
  const prompt =
    args?.prompt ??
    "Load a Stage1 bundle to extract components and token suggestions.";

  const loadTriggered = useRef(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [associatedRunId, setAssociatedRunId] = useState<string | null>(null);

  const handlePayloadLoad = useCallback(
    (bundlePayload: Stage1BundlePayload | string) => {
      if (loadTriggered.current) {
        return;
      }
      const outcome = loadBundle(bundlePayload);
      addResult(buildLoadBundleToolResult(outcome));
      loadTriggered.current = true;
    },
    [addResult, loadBundle]
  );

  const handleRunSelect = useCallback(
    async (run: Stage1RunSummary) => {
      if (loadTriggered.current || resolved || isError) {
        return;
      }

      setBundleError(null);
      setBundleLoading(true);
      setActiveRunId(run.runId);

      try {
        const bundle = await buildStage1BundleFromRun(run);
        const outcome = loadBundle(bundle);
        addResult(buildLoadBundleToolResult(outcome));

        if (projectSlug) {
          try {
            const res = await fetch("/api/projects/bundles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                slug: projectSlug,
                input: {
                  sourceRun: {
                    runId: run.runId,
                    hostname: run.hostname,
                    timestamp: run.timestamp,
                    manifestPath: run.runDir ? `${run.runDir}/manifest.json` : undefined,
                    bundlePath: run.runDir ?? undefined,
                  },
                  bundle,
                },
              }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: res.statusText }));
              throw new Error(err.error ?? "Failed to save bundle association");
            }
            setAssociatedRunId(run.runId);
          } catch (error) {
            setBundleError(
              formatMcpServiceError("stage1", error, {
                operation: "saving project bundle association",
              })
            );
          }
        }

        loadTriggered.current = true;
      } catch (error) {
        setBundleError(
          formatMcpServiceError("stage1", error, {
            operation: "loading the selected Stage1 bundle",
          })
        );
      } finally {
        setBundleLoading(false);
      }
    },
    [addResult, isError, loadBundle, projectSlug, resolved]
  );

  useEffect(() => {
    if (loadTriggered.current || resolved || isError || !payload) {
      return;
    }

    handlePayloadLoad(payload);
  }, [handlePayloadLoad, isError, payload, resolved]);

  useEffect(() => {
    let cancelled = false;

    const restoreAssociation = async () => {
      if (!projectSlug || loadTriggered.current || resolved || isError || payload) {
        return;
      }

      try {
        const res = await fetch(`/api/projects/bundles?slug=${encodeURIComponent(projectSlug)}`);
        if (!res.ok) {
          throw new Error(`Failed to load bundle association: ${res.statusText}`);
        }
        const data = await res.json();
        const association = data.association as ProjectBundleAssociation | null;
        if (!association || cancelled) {
          return;
        }

        setAssociatedRunId(association.sourceRun.runId);
        setActiveRunId(association.sourceRun.runId);

        if (!association.bundle) {
          return;
        }

        setBundleLoading(true);
        const outcome = loadBundle(association.bundle);
        addResult(buildLoadBundleToolResult(outcome));
        loadTriggered.current = true;
      } catch (error) {
        if (!cancelled) {
          setBundleError(
            formatMcpServiceError("stage1", error, {
              operation: "restoring associated project bundle",
            })
          );
        }
      } finally {
        if (!cancelled) {
          setBundleLoading(false);
        }
      }
    };

    void restoreAssociation();

    return () => {
      cancelled = true;
    };
  }, [addResult, isError, loadBundle, payload, projectSlug, resolved]);

  const resultErrors = result?.errors ?? [];
  const loadFailed = result ? !result.loaded || resultErrors.length > 0 : false;

  const summaryComponents = result?.componentCount ?? componentCount;
  const summaryTokens = result?.tokenSuggestionCount ?? tokenSuggestionCount;

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Stage1 Bundle</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={status.type} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
            <div className="space-y-1">
              <div>Request ID: {requestId}</div>
              <div>Project: {projectSlug}</div>
              {associatedRunId ? <div>Associated run: {associatedRunId}</div> : null}
              <div>Components: {summaryComponents}</div>
              <div>Token suggestions: {summaryTokens}</div>
            </div>
        </ToolOutputCardMeta>

        {isError ? (
          <ToolOutputCardCallout tone="danger">
            Tool error reported.
          </ToolOutputCardCallout>
        ) : null}

        {resolved && !loadFailed ? (
          <ToolOutputCardCallout tone="success" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-100/70">
              Bundle ingested
            </div>
            <div className="text-sm font-medium text-emerald-50">
              {summaryComponents} component
              {summaryComponents === 1 ? "" : "s"} and {summaryTokens} token
              suggestion{summaryTokens === 1 ? "" : "s"} captured.
            </div>
            <div className="text-xs text-emerald-100/60">
              Resolved at {result?.resolvedAt}
            </div>
          </ToolOutputCardCallout>
        ) : null}

        {resolved && loadFailed ? (
          <ToolOutputCardCallout tone="danger" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-red-100/70">
              Bundle load failed
            </div>
            <div className="text-sm font-medium text-red-50">
              {resultErrors.join(" ")}
            </div>
          </ToolOutputCardCallout>
        ) : null}

        {!resolved && !hasPayload ? (
          <div className="space-y-3">
            <ToolOutputCardCallout tone="info">
              Select a Stage1 run to load its bundle into the Workbench.
            </ToolOutputCardCallout>
            {bundleError ? (
              <ToolOutputCardCallout tone="danger">{bundleError}</ToolOutputCardCallout>
            ) : null}
            {bundleLoading ? (
              <ToolOutputCardCallout tone="warning">
                Loading Stage1 bundle from the selected run...
              </ToolOutputCardCallout>
            ) : null}
            <BundlePicker
              onSelect={handleRunSelect}
              selectedRunId={activeRunId}
              associatedRunId={associatedRunId}
              busy={bundleLoading}
            />
          </div>
        ) : null}
      </ToolOutputCardBody>
    </ToolOutputCard>
  );
};

export const Stage1BundleToolUI = makeAssistantToolUI<
  LoadBundleToolArgs,
  LoadBundleToolResult
>({
  toolName: LOAD_BUNDLE_TOOL_NAME,
  render: Stage1BundleToolCard,
});
