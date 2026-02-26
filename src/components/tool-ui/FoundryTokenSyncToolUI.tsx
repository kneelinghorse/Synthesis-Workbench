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
import { mapFoundryTokensToWorkbenchPaths } from "@/lib/foundry/token-bridge";
import { getFoundryMcpClient } from "@/lib/mcp/foundry-client";
import { formatMcpServiceError } from "@/lib/mcp/user-facing-errors";
import {
  FOUNDRY_TOKEN_SYNC_TOOL_NAME,
  type FoundryTokenSyncToolArgs,
  type FoundryTokenSyncToolResult,
} from "@/lib/runtime/tools/foundry-token-sync-tool";
import { useTokenStateStore } from "@/lib/stores/token-state";
import { cn } from "@/lib/utils";

const DEFAULT_FOUNDRY_BRAND = "A";

const FoundryTokenSyncToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<FoundryTokenSyncToolArgs, FoundryTokenSyncToolResult>) => {
  const syncCanonicalTokens = useTokenStateStore((state) => state.syncCanonicalTokens);
  const resolved = Boolean(result);

  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncTriggered = useRef(false);

  const requestId = args?.requestId ?? "unknown";
  const title = args?.title ?? "Foundry token sync";
  const prompt =
    args?.prompt ??
    "Build canonical tokens from Foundry and merge them into the Workbench token state.";
  const preserveManualOverrides = args?.preserveManualOverrides !== false;

  const runSync = useCallback(async () => {
    if (syncTriggered.current || resolved || isError) {
      return;
    }

    setSyncError(null);
    setSyncing(true);

    try {
      const client = getFoundryMcpClient();
      const payload = await client.buildTokens(
        args?.brand ?? DEFAULT_FOUNDRY_BRAND,
        args?.theme
      );

      if (!payload.tokens || Object.keys(payload.tokens).length === 0) {
        setSyncError(
          'Foundry returned no inline tokens from "tokens.build". (This Foundry bridge may be running in dry-run mode or does not support token payloads yet.)'
        );
        return;
      }

      const bridgeResult = mapFoundryTokensToWorkbenchPaths(payload.tokens ?? {});
      const syncResult = syncCanonicalTokens(bridgeResult.mappedTokens, {
        preserveManualOverrides,
      });

      const overriddenEntries = syncResult.entries.filter(
        (entry) => entry.status === "overridden"
      );

      addResult({
        synced: true,
        importedCount: syncResult.importedCount,
        appliedCount: syncResult.appliedCount,
        preservedOverrideCount: syncResult.preservedOverrideCount,
        overriddenCount: overriddenEntries.length,
        invalidPaths: syncResult.invalidPaths,
        unmappedFoundryPaths: bridgeResult.unmappedPaths,
        entries: syncResult.entries,
        resolvedAt: new Date().toISOString(),
      });
      syncTriggered.current = true;
    } catch (error) {
      setSyncError(
        formatMcpServiceError("foundry", error, {
          operation: "building canonical tokens via tokens.build",
        })
      );
    } finally {
      setSyncing(false);
    }
  }, [
    addResult,
    args?.brand,
    args?.theme,
    isError,
    preserveManualOverrides,
    resolved,
    syncCanonicalTokens,
  ]);

  useEffect(() => {
    if (!resolved && !isError && !syncTriggered.current) {
      void runSync();
    }
  }, [isError, resolved, runSync]);

  const visibleEntries = useMemo(() => {
    const entries = result?.entries ?? [];
    return entries.slice(0, 24);
  }, [result?.entries]);

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Canonical Tokens</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={status.type} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>Request ID: {requestId}</div>
            <div>Precedence: Foundry canonical {"<"} Stage1 {"<"} manual</div>
            <div>State: {resolved ? "Synced" : syncing ? "Syncing..." : "Pending"}</div>
          </div>
        </ToolOutputCardMeta>

        {isError ? (
          <ToolOutputCardCallout tone="danger">
            Tool error reported.
          </ToolOutputCardCallout>
        ) : null}

        {syncing ? (
          <ToolOutputCardCallout tone="info">
            Calling Foundry <code>tokens.build</code> and mapping tokens to Workbench paths...
          </ToolOutputCardCallout>
        ) : null}

        {syncError ? (
          <ToolOutputCardCallout tone="danger">{syncError}</ToolOutputCardCallout>
        ) : null}

        {resolved && result?.synced ? (
          <ToolOutputCardCallout tone="success" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-100/70">
              Canonical sync complete
            </div>
            <div className="text-sm font-medium text-emerald-50">
              Imported {result.importedCount} token
              {result.importedCount === 1 ? "" : "s"} from Foundry, applied{" "}
              {result.appliedCount}.
            </div>
            <div className="text-xs text-emerald-100/60">
              Preserved manual overrides: {result.preservedOverrideCount}. Overridden
              tokens: {result.overriddenCount}.
            </div>
          </ToolOutputCardCallout>
        ) : null}

        {result?.invalidPaths && result.invalidPaths.length > 0 ? (
          <ToolOutputCardCallout tone="warning" className="space-y-1">
            <div className="text-xs uppercase tracking-[0.2em] text-amber-100/80">
              Invalid mapped paths
            </div>
            <div className="text-xs text-amber-100/70">
              {result.invalidPaths.join(", ")}
            </div>
          </ToolOutputCardCallout>
        ) : null}

        {result?.unmappedFoundryPaths && result.unmappedFoundryPaths.length > 0 ? (
          <ToolOutputCardCallout tone="warning" className="space-y-1">
            <div className="text-xs uppercase tracking-[0.2em] text-amber-100/80">
              Unmapped Foundry paths
            </div>
            <div className="text-xs text-amber-100/70">
              {result.unmappedFoundryPaths.join(", ")}
            </div>
          </ToolOutputCardCallout>
        ) : null}

        {visibleEntries.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Canonical vs current (showing {visibleEntries.length}
              {result?.entries && result.entries.length > visibleEntries.length
                ? ` of ${result.entries.length}`
                : ""}
              )
            </div>
            {visibleEntries.map((entry) => (
              <div
                key={entry.path}
                className={cn(
                  "rounded-xl border border-white/10 bg-black/20 px-3 py-3",
                  entry.status === "overridden" &&
                    "border-amber-400/40 bg-amber-500/5"
                )}
              >
                <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-[0.2em]">
                  <span>{entry.path}</span>
                  <span>{entry.status}</span>
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/50">
                  Active source: {entry.source}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                      Canonical
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-white/80">
                      {entry.canonical}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                      Current
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-white">
                      {entry.current ?? "unset"}
                    </div>
                  </div>
                </div>
                {entry.conflict ? (
                  <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-2 text-xs text-amber-100/90">
                    Conflict: {entry.conflictingSources?.join(", ") ?? "sources disagree"}.
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </ToolOutputCardBody>

      {resolved || isError ? null : (
        <ToolOutputCardFooter>
          <span className="text-xs text-white/50">
            Sync canonical Foundry tokens into this workspace.
          </span>
          <Button
            type="button"
            size="sm"
            className="bg-white text-black hover:bg-white/90"
            onClick={() => void runSync()}
            disabled={syncing}
          >
            {syncing ? "Syncing..." : "Retry sync"}
          </Button>
        </ToolOutputCardFooter>
      )}
    </ToolOutputCard>
  );
};

export const FoundryTokenSyncToolUI = makeAssistantToolUI<
  FoundryTokenSyncToolArgs,
  FoundryTokenSyncToolResult
>({
  toolName: FOUNDRY_TOKEN_SYNC_TOOL_NAME,
  render: FoundryTokenSyncToolCard,
});
