"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompositionErrorOverlay } from "@/components/workbench/CompositionErrorOverlay";
import { FoundryHealthBanner } from "@/components/workbench/FoundryHealthBanner";
import { FoundryStatusChip } from "@/components/workbench/FoundryStatusChip";
import { PreviewPane } from "@/components/workbench/PreviewPane";
import { useFoundryHealth } from "@/hooks/useFoundryHealth";
import { mapFoundryTokensToWorkbenchPaths } from "@/lib/foundry/token-bridge";
import {
  getFoundryMcpClient,
  type FoundryMcpClient,
} from "@/lib/mcp/foundry-client";
import { formatMcpServiceError } from "@/lib/mcp/user-facing-errors";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import {
  PREVIEW_THEMES,
  type PreviewConnectionStatus,
  type PreviewThemeId,
  usePreviewStateStore,
} from "@/lib/stores/preview-state";
import { useTokenStateStore } from "@/lib/stores/token-state";
import { useCompositionPreview } from "@/hooks/useCompositionPreview";
import { cn } from "@/lib/utils";

const THEME_LABELS: Record<PreviewThemeId, string> = {
  base: "Light",
  dark: "Dark",
  hc: "High Contrast",
};

const CONNECTION_STATUS_LABELS: Record<PreviewConnectionStatus, string> = {
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Connection Error",
};

const CONNECTION_STATUS_BADGE: Record<PreviewConnectionStatus, string> = {
  connecting: "text-blue-300",
  connected: "text-emerald-300",
  disconnected: "text-white/60",
  error: "text-rose-300",
};

const CONNECTION_STATUS_DOT: Record<PreviewConnectionStatus, string> = {
  connecting: "bg-blue-400",
  connected: "bg-emerald-400",
  disconnected: "bg-white/40",
  error: "bg-rose-400",
};

const DEFAULT_FOUNDRY_BRAND = "A";
const CANONICAL_TOKEN_WARNING =
  "Foundry did not return canonical tokens for this theme (skipping sync).";

const THEME_REQUEST_CANDIDATES: Record<PreviewThemeId, string[]> = {
  base: ["light", "base", "default"],
  dark: ["dark", "night"],
  hc: ["hc", "high-contrast", "high_contrast"],
};

const loadThemeTokens = async (
  client: FoundryMcpClient,
  theme: PreviewThemeId
) => {
  let lastError: unknown = null;
  let lastResult: ReturnType<typeof mapFoundryTokensToWorkbenchPaths> | null = null;

  for (const candidate of THEME_REQUEST_CANDIDATES[theme]) {
    try {
      const payload = await client.buildTokens(DEFAULT_FOUNDRY_BRAND, candidate);
      if (!payload.tokens || Object.keys(payload.tokens).length === 0) {
        return { mappedTokens: {}, unmappedPaths: [] };
      }
      const bridgeResult = mapFoundryTokensToWorkbenchPaths(payload.tokens ?? {});
      if (Object.keys(bridgeResult.mappedTokens).length > 0) {
        return bridgeResult;
      }
      lastResult = bridgeResult;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResult) {
    return lastResult;
  }

  if (lastError) {
    throw lastError;
  }

  return { mappedTokens: {}, unmappedPaths: [] };
};

export const PreviewPanel = ({ className }: { className?: string }) => {
  const html = usePreviewStateStore((state) => state.html);
  const theme = usePreviewStateStore((state) => state.theme);
  const setTheme = usePreviewStateStore((state) => state.setTheme);
  const lastUpdatedAt = usePreviewStateStore((state) => state.lastUpdatedAt);
  const connectionStatus = usePreviewStateStore(
    (state) => state.connectionStatus
  );
  const foundryStatus = usePreviewStateStore((state) => state.foundryStatus);
  const syncCanonicalTokens = useTokenStateStore(
    (state) => state.syncCanonicalTokens
  );
  const compositionStatus = useDocumentStateStore((s) => s.compositionStatus);
  const compositionErrors = useDocumentStateStore((s) => s.compositionErrors);
  const requestRetry = useDocumentStateStore((s) => s.requestRetry);
  const skipComponent = useDocumentStateStore((s) => s.skipComponent);

  const [themeSyncStatus, setThemeSyncStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [themeSyncMessage, setThemeSyncMessage] = useState<string | null>(null);
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0);
  const [themeSyncNonce, setThemeSyncNonce] = useState(0);
  const themeTokenCacheRef = useRef<
    Partial<Record<PreviewThemeId, Record<string, string>>>
  >({});
  const foundryEndpoint =
    process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL?.trim() ||
    process.env.OODS_FOUNDRY_MCP_URL?.trim() ||
    null;

  const client = useMemo(() => {
    try {
      return getFoundryMcpClient();
    } catch {
      // Foundry not configured — composition won't run but
      // single-component previews still work via preview-state.
      return null;
    }
  }, [foundryEndpoint]);

  useCompositionPreview(client);
  const isOfflineMode = client === null;
  const isLiveFragmentPreview = foundryStatus === "live";

  const foundryHealth = useFoundryHealth({ intervalMs: 30_000 });

  useEffect(() => {
    let cancelled = false;

    const syncTheme = async () => {
      if (!client) {
        setThemeSyncStatus("ready");
        setThemeSyncMessage(
          "Foundry MCP is unavailable. Static Preview mode is active and theme token sync is disabled."
        );
        return;
      }

      setThemeSyncStatus("loading");
      setThemeSyncMessage(null);

      try {
        const cached = themeTokenCacheRef.current[theme];
        const bridgeResult = cached
          ? { mappedTokens: cached, unmappedPaths: [] }
          : await loadThemeTokens(client, theme);

        themeTokenCacheRef.current[theme] = bridgeResult.mappedTokens;

        if (Object.keys(bridgeResult.mappedTokens).length === 0) {
          if (isLiveFragmentPreview) {
            setThemeSyncStatus("ready");
            setThemeSyncMessage(null);
            return;
          }

          const hint =
            bridgeResult.unmappedPaths.length > 0
              ? `Foundry returned ${bridgeResult.unmappedPaths.length} token path${
                  bridgeResult.unmappedPaths.length === 1 ? "" : "s"
                } but none mapped to Workbench tokens.`
              : CANONICAL_TOKEN_WARNING;
          setThemeSyncStatus("ready");
          setThemeSyncMessage(hint);
          return;
        }

        const syncResult = syncCanonicalTokens(bridgeResult.mappedTokens, {
          preserveManualOverrides: true,
        });

        if (cancelled) {
          return;
        }

        const notes: string[] = [];
        if (syncResult.preservedOverrideCount > 0) {
          notes.push(
            `${syncResult.preservedOverrideCount} manual override${
              syncResult.preservedOverrideCount === 1 ? "" : "s"
            } preserved`
          );
        }
        if (bridgeResult.unmappedPaths.length > 0) {
          notes.push(
            `${bridgeResult.unmappedPaths.length} unmapped Foundry path${
              bridgeResult.unmappedPaths.length === 1 ? "" : "s"
            }`
          );
        }

        setThemeSyncStatus("ready");
        setThemeSyncMessage(notes.length > 0 ? notes.join(" · ") : null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setThemeSyncStatus("error");
        setThemeSyncMessage(
          formatMcpServiceError("foundry", error, {
            operation: `loading \"${THEME_LABELS[theme]}\" tokens`,
          })
        );
      }
    };

    // Clear cached tokens on retry so we re-fetch from Foundry.
    if (themeSyncNonce > 0) {
      delete themeTokenCacheRef.current[theme];
    }

    void syncTheme();

    return () => {
      cancelled = true;
    };
     
  }, [client, isLiveFragmentPreview, syncCanonicalTokens, theme, themeSyncNonce]);

  const document = useDocumentStateStore((s) => s.document);

  const isRendering = compositionStatus === "rendering";
  const hasErrors = compositionErrors.length > 0;
  const visibleThemeSyncMessage =
    isLiveFragmentPreview && themeSyncMessage === CANONICAL_TOKEN_WARNING
      ? null
      : themeSyncMessage;
  const showOfflineEmptyState = isOfflineMode && !html && !document;
  const handleReloadPreview = useCallback(() => {
    setPreviewReloadNonce((previous) => previous + 1);
  }, []);
  const handleRetryThemeSync = useCallback(() => {
    setThemeSyncNonce((previous) => previous + 1);
  }, []);

  return (
    <div className={cn("flex h-full flex-col gap-4", className)}>
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-white/50">
              Preview Pane
            </div>
            <div className="mt-1 text-sm text-white/70">
              {isOfflineMode
                ? "Static fallback render (Foundry offline)."
                : "Live render output from Foundry."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FoundryStatusChip status={foundryStatus} endpoint={foundryEndpoint} />
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-2 py-1 text-[10px] uppercase tracking-[0.16em]",
                CONNECTION_STATUS_BADGE[connectionStatus]
              )}
            >
              <span
                className={cn(
                  "inline-flex h-2 w-2 rounded-full",
                  CONNECTION_STATUS_DOT[connectionStatus]
                )}
              />
              <span>{CONNECTION_STATUS_LABELS[connectionStatus]}</span>
            </div>
            <label
              htmlFor="preview-theme"
              className="text-[10px] uppercase tracking-[0.2em] text-white/50"
            >
              Theme
            </label>
            <select
              id="preview-theme"
              value={theme}
              onChange={(event) =>
                setTheme(event.target.value as PreviewThemeId)
              }
              className="rounded-lg border border-white/20 bg-black/35 px-2 py-1 text-xs text-white focus:border-white/40 focus:outline-none"
            >
              {PREVIEW_THEMES.map((themeId) => (
                <option key={themeId} value={themeId}>
                  {THEME_LABELS[themeId]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleReloadPreview}
              className="rounded-lg border border-white/20 bg-black/35 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white hover:border-white/40 hover:bg-black/45 focus:border-white/60 focus:outline-none"
            >
              Reload Preview
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/50">
            {themeSyncStatus === "loading" && (
              <span className="text-blue-400">
                Applying {THEME_LABELS[theme]} theme...
              </span>
            )}
            {themeSyncStatus === "error" && (
              <span className="inline-flex items-center gap-1.5 text-rose-400">
                Theme sync failed
                <button
                  type="button"
                  onClick={handleRetryThemeSync}
                  className="rounded border border-rose-400/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-rose-300 hover:border-rose-300/50 hover:bg-rose-900/40"
                >
                  Retry
                </button>
              </span>
            )}
            {isRendering && (
              <span className="text-blue-400">Rendering...</span>
            )}
            {hasErrors && !isRendering && (
              <span className="text-amber-400">
                {compositionErrors.length} error
                {compositionErrors.length !== 1 ? "s" : ""}
              </span>
            )}
            {lastUpdatedAt ? `Updated ${lastUpdatedAt}` : "Awaiting render"}
          </div>
        </div>
      </div>

      <FoundryHealthBanner
        status={foundryHealth.status}
        checking={foundryHealth.checking}
        onRetry={foundryHealth.check}
      />

      {visibleThemeSyncMessage ? (
        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded-xl border px-4 py-2 text-xs",
            themeSyncStatus === "error"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
              : "border-white/10 bg-white/5 text-white/70"
          )}
        >
          <span className="min-w-0 flex-1">{visibleThemeSyncMessage}</span>
          {themeSyncStatus === "error" && (
            <button
              type="button"
              onClick={handleRetryThemeSync}
              className="shrink-0 rounded border border-rose-400/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-200 hover:border-rose-300/50 hover:bg-rose-900/40"
            >
              Retry
            </button>
          )}
        </div>
      ) : null}

      <div className="relative min-h-[320px] flex-1">
        {isRendering && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-black/30 backdrop-blur-sm">
            <div className="text-sm text-white/60">Composing layout...</div>
          </div>
        )}

        {showOfflineEmptyState ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-black/20 px-6 py-10 text-center">
            <div className="text-sm font-medium text-white/60">
              No design loaded
            </div>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-white/40">
              Foundry is offline — static preview mode is active. Load a design
              document or use the chat to create a component composition. The
              preview will render using built-in fallback styles.
            </p>
            <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-white/30">
              Try: &ldquo;Create a Card with a heading and a Button&rdquo;
            </p>
          </div>
        ) : (
          <PreviewPane html={html} reloadNonce={previewReloadNonce} />
        )}

        {hasErrors && !isRendering && (
          <CompositionErrorOverlay
            errors={compositionErrors}
            onRetry={requestRetry}
            onSkip={skipComponent}
          />
        )}
      </div>
    </div>
  );
};
