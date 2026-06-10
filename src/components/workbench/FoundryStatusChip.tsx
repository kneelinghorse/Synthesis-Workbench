"use client";

import { cn } from "@/lib/utils";
import type { PreviewFoundryStatus } from "@/lib/stores/preview-state";

type FoundryStatusChipProps = {
  status: PreviewFoundryStatus;
  endpoint?: string | null;
};

const STATUS_LABELS: Record<PreviewFoundryStatus, string> = {
  live: "Live Render",
  "dry-run": "Dry-Run",
  offline: "Offline",
};

const STATUS_CONTAINER_STYLES: Record<PreviewFoundryStatus, string> = {
  live: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  "dry-run": "border-amber-500/40 bg-amber-500/10 text-amber-100",
  offline: "border-white/20 bg-black/25 text-white/70",
};

const STATUS_DOT_STYLES: Record<PreviewFoundryStatus, string> = {
  live: "bg-emerald-400",
  "dry-run": "bg-amber-400",
  offline: "bg-white/40",
};

export const FoundryStatusChip = ({ status, endpoint }: FoundryStatusChipProps) => {
  const tooltip = endpoint
    ? `Foundry endpoint: ${endpoint}`
    : "Foundry endpoint not configured.";

  return (
    <div
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em]",
        STATUS_CONTAINER_STYLES[status]
      )}
    >
      <span
        className={cn("inline-flex h-2 w-2 rounded-full", STATUS_DOT_STYLES[status])}
      />
      <span>{STATUS_LABELS[status]}</span>
    </div>
  );
};
