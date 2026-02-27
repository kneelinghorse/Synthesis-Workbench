"use client";

import { useEffect, useRef } from "react";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import { useDataContextStore } from "@/lib/stores/data-context";
import {
  getPreviewRenderer,
  isFoundryUnavailableError,
} from "@/lib/engine/preview-renderer";
import type { FoundryMcpClient } from "@/lib/mcp/foundry-client";
import { renderStaticDocument } from "@/lib/preview/static-renderer";

/**
 * Hook that bridges document state + data context → Foundry fragment render → preview state.
 *
 * Subscribes to both the document store (revision) and data context store (revision).
 * When either changes, builds a Foundry fragment payload with active data context
 * and pushes the resulting HTML to the preview state store.
 *
 * Handles:
  * - Loading state while renders are in-flight
  * - Error state when composition fails
  * - Stale render cancellation (if state changes while rendering)
 * - Data context passed to renderer for $data.x binding resolution before Foundry call
 */
export function useCompositionPreview(client: FoundryMcpClient | null) {
  const document = useDocumentStateStore((s) => s.document);
  const revision = useDocumentStateStore((s) => s.revision);
  const retryNonce = useDocumentStateStore((s) => s.retryNonce);
  const setCompositionState = useDocumentStateStore(
    (s) => s.setCompositionState,
  );
  const setHtml = usePreviewStateStore((s) => s.setHtml);
  const setFoundryStatus = usePreviewStateStore((s) => s.setFoundryStatus);
  const dataContext = useDataContextStore((s) => s.context);
  const dataRevision = useDataContextStore((s) => s.revision);
  const activeRenderRef = useRef(0);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!document) {
      return;
    }

    // Monotonic generation used to drop stale async results.
    const renderGeneration = activeRenderRef.current + 1;
    activeRenderRef.current = renderGeneration;

    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
      renderTimerRef.current = null;
    }

    setCompositionState("rendering");

    renderTimerRef.current = setTimeout(() => {
      renderTimerRef.current = null;

      const applyStaticFallback = () => {
        const html = renderStaticDocument(document, { dataContext });
        if (activeRenderRef.current !== renderGeneration) {
          return;
        }
        setHtml(html);
        setFoundryStatus("offline");
        setCompositionState("success");
      };

      if (!client) {
        try {
          applyStaticFallback();
        } catch (err) {
          if (activeRenderRef.current !== renderGeneration) {
            return;
          }

          setCompositionState("error", [
            {
              componentId: "_composition",
              componentRef: "_static_renderer",
              message: err instanceof Error ? err.message : String(err),
            },
          ]);
        }
        return;
      }

      const previewRenderer = getPreviewRenderer();

      previewRenderer.render(document, client, { dataContext })
        .then((result) => {
          // If a newer render started, discard this result
          if (activeRenderRef.current !== renderGeneration) {
            return;
          }

          setHtml(result.html);
          setFoundryStatus(result.foundryStatus);

          if (result.errors.length > 0) {
            setCompositionState("error", result.errors);
          } else {
            setCompositionState("success");
          }
        })
        .catch((err) => {
          if (activeRenderRef.current !== renderGeneration) {
            return;
          }

          if (isFoundryUnavailableError(err)) {
            try {
              applyStaticFallback();
              return;
            } catch {
              // Continue to the generic error path if fallback rendering fails.
            }
          }

          setCompositionState("error", [
            {
              componentId: "_composition",
              componentRef: "_system",
              message: err instanceof Error ? err.message : String(err),
            },
          ]);
        });
    }, 24);

    return () => {
      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current);
        renderTimerRef.current = null;
      }
    };
  }, [
    document,
    revision,
    retryNonce,
    client,
    setCompositionState,
    setHtml,
    setFoundryStatus,
    dataContext,
    dataRevision,
  ]);
}
