"use client";

import { useMemo } from "react";
import { AlertTriangle, RotateCcw, SkipForward, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKBENCH_S44_COMPONENTS } from "@/lib/foundry/catalog";
import type { CompositionError } from "@/lib/engine/composition-renderer";

type CompositionErrorOverlayProps = {
  errors: CompositionError[];
  onRetry: () => void;
  onSkip: (componentId: string) => void;
  className?: string;
};

/** System-level error IDs that should not offer "skip" */
const SYSTEM_ERROR_IDS = new Set(["_composition", "_fragments", "_system"]);

const isComponentError = (error: CompositionError): boolean =>
  !SYSTEM_ERROR_IDS.has(error.componentId);

/**
 * Find a likely component name suggestion when the error mentions
 * an unknown or invalid component reference.
 */
function suggestComponentName(error: CompositionError): string | null {
  const msg = error.message.toLowerCase();
  const ref = error.componentRef.replace(/^oods:/i, "").trim();

  // Only suggest for errors that indicate an unrecognized component
  const isUnknownComponent =
    msg.includes("unknown") ||
    msg.includes("not found") ||
    msg.includes("unrecognized") ||
    msg.includes("unsupported") ||
    msg.includes("invalid component");

  if (!isUnknownComponent) return null;

  // Try exact case-insensitive match first
  const exact = WORKBENCH_S44_COMPONENTS.find(
    (name) => name.toLowerCase() === ref.toLowerCase()
  );
  if (exact) return exact;

  // Try prefix match
  const prefixMatch = WORKBENCH_S44_COMPONENTS.find((name) =>
    name.toLowerCase().startsWith(ref.toLowerCase().slice(0, 3))
  );
  if (prefixMatch) return prefixMatch;

  // Suggest the full list as a hint
  return null;
}

function getGuidanceMessage(error: CompositionError): string | null {
  const msg = error.message.toLowerCase();

  // Data binding errors (check before "unknown" since binding messages may contain "unknown context")
  if (msg.includes("binding") || msg.includes("$data")) {
    return "Check your data context — the binding path may reference missing data.";
  }

  // Unknown component
  if (
    msg.includes("unknown") ||
    msg.includes("not found") ||
    msg.includes("unrecognized")
  ) {
    const suggestion = suggestComponentName(error);
    if (suggestion) {
      return `Try using oods:${suggestion} instead.`;
    }
    return `Valid components: ${WORKBENCH_S44_COMPONENTS.map((n) => `oods:${n}`).join(", ")}`;
  }

  // Connection / timeout
  if (
    msg.includes("connection") ||
    msg.includes("timeout") ||
    msg.includes("unreachable")
  ) {
    return "Foundry may be offline. Check the MCP bridge connection.";
  }

  // Validation
  if (msg.includes("validation") || msg.includes("schema")) {
    return "The design document may have invalid props. Check component documentation.";
  }

  return null;
}

export const CompositionErrorOverlay = ({
  errors,
  onRetry,
  onSkip,
  className,
}: CompositionErrorOverlayProps) => {
  const { componentErrors, systemErrors } = useMemo(() => {
    const comp: CompositionError[] = [];
    const sys: CompositionError[] = [];
    for (const err of errors) {
      if (isComponentError(err)) {
        comp.push(err);
      } else {
        sys.push(err);
      }
    }
    return { componentErrors: comp, systemErrors: sys };
  }, [errors]);

  if (errors.length === 0) return null;

  return (
    <div
      className={cn(
        "absolute bottom-0 left-0 right-0 z-10 max-h-48 overflow-y-auto rounded-b-3xl border-t border-red-500/20 bg-red-950/85 px-4 py-3 backdrop-blur",
        className
      )}
      role="alert"
      aria-label="Composition errors"
    >
      {/* Header with global retry */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-red-300">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="font-medium">
            {errors.length} error{errors.length !== 1 ? "s" : ""}
            {componentErrors.length > 0 &&
              ` · ${componentErrors.length} skippable`}
          </span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded border border-red-300/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-100 transition hover:border-red-200/50 hover:bg-red-900/40"
        >
          <RotateCcw className="size-2.5" />
          Retry All
        </button>
      </div>

      {/* System-level errors */}
      {systemErrors.map((err, i) => {
        const guidance = getGuidanceMessage(err);
        return (
          <div
            key={`sys-${err.componentId}-${i}`}
            className="mb-1.5 rounded-lg border border-red-500/15 bg-red-900/30 px-3 py-2"
          >
            <div className="text-xs text-red-200">{err.message}</div>
            {guidance ? (
              <div className="mt-1 flex items-start gap-1.5 text-[10px] text-amber-300/80">
                <Lightbulb className="mt-0.5 size-2.5 shrink-0" />
                <span>{guidance}</span>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Component-level errors */}
      {componentErrors.map((err, i) => {
        const guidance = getGuidanceMessage(err);
        return (
          <div
            key={`comp-${err.componentId}-${i}`}
            className="mb-1.5 flex items-start justify-between gap-3 rounded-lg border border-red-500/15 bg-red-900/30 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="rounded bg-red-800/50 px-1 py-0.5 text-[10px] font-mono text-red-200/80">
                  {err.componentRef}
                </span>
                <span className="truncate text-red-200">{err.message}</span>
              </div>
              {guidance ? (
                <div className="mt-1 flex items-start gap-1.5 text-[10px] text-amber-300/80">
                  <Lightbulb className="mt-0.5 size-2.5 shrink-0" />
                  <span>{guidance}</span>
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-0.5 rounded border border-red-300/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-red-100 transition hover:border-red-200/50 hover:bg-red-900/40"
                title="Re-render this component"
              >
                <RotateCcw className="size-2" />
                Retry
              </button>
              <button
                type="button"
                onClick={() => onSkip(err.componentId)}
                className="inline-flex items-center gap-0.5 rounded border border-red-300/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-red-100 transition hover:border-red-200/50 hover:bg-red-900/40"
                title="Remove this component and re-render"
              >
                <SkipForward className="size-2" />
                Skip
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
