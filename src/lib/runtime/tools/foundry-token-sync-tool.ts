import type { CanonicalTokenEntry } from "@/lib/stores/token-state";

export const FOUNDRY_TOKEN_SYNC_TOOL_NAME = "sync_foundry_tokens";

export type FoundryTokenSyncToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  brand?: string;
  theme?: string;
  preserveManualOverrides?: boolean;
};

export type FoundryTokenSyncEntry = Pick<
  CanonicalTokenEntry,
  "path" | "canonical" | "current" | "status" | "source"
> &
  Partial<
    Pick<
      CanonicalTokenEntry,
      "values" | "conflict" | "conflictingSources"
    >
  >;

export type FoundryTokenSyncToolResult = {
  synced: boolean;
  importedCount: number;
  appliedCount: number;
  preservedOverrideCount: number;
  overriddenCount: number;
  invalidPaths: string[];
  unmappedFoundryPaths: string[];
  entries: FoundryTokenSyncEntry[];
  resolvedAt: string;
  error?: string;
};
