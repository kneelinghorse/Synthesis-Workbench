"use client";

import {
  makeAssistantToolUI,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
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
import { createStage1McpClient } from "@/lib/mcp/stage1-client";
import { runInspectionPipeline } from "@/lib/stage1/inspection-pipeline";
import {
  INSPECT_SURFACE_TOOL_NAME,
  buildInspectToolResult,
  type InspectSurfaceToolArgs,
  type InspectSurfaceToolResult,
} from "@/lib/runtime/tools/stage1-tools";

/** 5-minute timeout for long-running inspections */
const INSPECT_TIMEOUT_MS = 300_000;

const formatElapsed = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

type PipelinePhase = "inspecting" | "loading" | "idle";

const InspectSurfaceToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<
  InspectSurfaceToolArgs,
  InspectSurfaceToolResult
>) => {
  const execTriggered = useRef(false);
  const resolved = Boolean(result);
  const [phase, setPhase] = useState<PipelinePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const title = args?.title ?? "Surface snapshot";
  const prompt =
    args?.prompt ??
    `Capturing surface snapshot of ${args?.url ?? "target URL"} with Stage1.`;
  const url = args?.url ?? "";

  // Elapsed time counter during active phases
  useEffect(() => {
    if (phase === "idle") return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const runInspection = useCallback(async () => {
    if (!url || execTriggered.current || resolved || isError) return;
    execTriggered.current = true;
    setPhase("inspecting");
    setError(null);

    try {
      const client = createStage1McpClient({ timeoutMs: INSPECT_TIMEOUT_MS });
      const inspectionResult = await client.inspectSurface({
        url,
        name: args?.name,
        passes: args?.passes,
        seedRoutes: args?.seedRoutes,
      });

      // Auto-chain into bundle loading pipeline
      setPhase("loading");
      const pipelineResult = await runInspectionPipeline(inspectionResult, {
        client,
      });

      addResult(
        buildInspectToolResult(inspectionResult, url, {
          error: pipelineResult.error,
          discovery: pipelineResult.discovery ?? undefined,
        }) as InspectSurfaceToolResult
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Surface snapshot failed";
      setError(message);
      addResult(
        buildInspectToolResult({ run: null, payload: null }, url, {
          error: message,
        }) as InspectSurfaceToolResult
      );
    } finally {
      setPhase("idle");
    }
  }, [addResult, args, isError, resolved, url]);

  // Auto-trigger inspection on mount
  useEffect(() => {
    if (!args || execTriggered.current || resolved || isError) return;
    void runInspection();
  }, [args, isError, resolved, runInspection]);

  const discovery = result?.discovery;

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Stage1 Surface</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={status.type} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>URL: {url || "—"}</div>
            {args?.passes?.length ? (
              <div>Passes: {args.passes.join(", ")}</div>
            ) : null}
            {result?.runId && <div>Run: {result.runId}</div>}
            {result?.hostname && <div>Hostname: {result.hostname}</div>}
            {discovery && (
              <>
                <div>Components: {discovery.componentCount}</div>
                <div>Token suggestions: {discovery.tokenSuggestionCount}</div>
              </>
            )}
          </div>
        </ToolOutputCardMeta>

        {phase === "inspecting" && (
          <ToolOutputCardCallout tone="warning">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              <span>
                Capturing surface snapshot of {url}... (
                {formatElapsed(elapsedSeconds)})
              </span>
            </div>
            <div className="mt-1 text-xs opacity-70">
              Capturing DOM, computed styles, and style fingerprint.
            </div>
          </ToolOutputCardCallout>
        )}

        {phase === "loading" && (
          <ToolOutputCardCallout tone="info">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
              <span>Loading discovery bundle into Workbench...</span>
            </div>
          </ToolOutputCardCallout>
        )}

        {isError && (
          <ToolOutputCardCallout tone="danger">
            Tool error reported.
          </ToolOutputCardCallout>
        )}

        {error && (
          <ToolOutputCardCallout tone="danger">{error}</ToolOutputCardCallout>
        )}

        {resolved && result?.inspected && (
          <ToolOutputCardCallout tone="success" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-100/70">
              {discovery?.bundleLoaded
                ? "Surface captured & bundle loaded"
                : "Surface captured"}
            </div>
            <div className="text-sm font-medium text-emerald-50">
              {result.hostname ?? url} — style fingerprint generated.
              {discovery?.bundleLoaded && (
                <>
                  {" "}
                  {discovery.componentCount} component
                  {discovery.componentCount === 1 ? "" : "s"} and{" "}
                  {discovery.tokenSuggestionCount} token suggestion
                  {discovery.tokenSuggestionCount === 1 ? "" : "s"} loaded.
                </>
              )}
            </div>
            {discovery?.discoveredComponents?.length ? (
              <div className="text-xs text-emerald-100/60">
                Components: {discovery.discoveredComponents.join(", ")}
              </div>
            ) : null}
            <div className="text-xs text-emerald-100/60">
              Resolved at {result.resolvedAt}
            </div>
          </ToolOutputCardCallout>
        )}

        {resolved && !result?.inspected && !error && (
          <ToolOutputCardCallout tone="danger" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-red-100/70">
              Surface capture failed
            </div>
            <div className="text-sm font-medium text-red-50">
              {result?.errors?.join(" ") ??
                result?.message ??
                "Unknown error"}
            </div>
          </ToolOutputCardCallout>
        )}
      </ToolOutputCardBody>
    </ToolOutputCard>
  );
};

export const InspectSurfaceToolUI = makeAssistantToolUI<
  InspectSurfaceToolArgs,
  InspectSurfaceToolResult
>({
  toolName: INSPECT_SURFACE_TOOL_NAME,
  render: InspectSurfaceToolCard,
});
