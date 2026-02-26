import type { TokenState } from "@/types/token-state";
import { getTokenPathValue } from "@/lib/stores/token-state";

export const TOKEN_ADJUSTMENT_TOOL_NAME = "update_token_state";

export type TokenAdjustmentToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  changes: Record<string, string>;
};

export type TokenChangeEntry = {
  path: string;
  from: string | null;
  to: string;
  valid: boolean;
};

export type TokenAdjustmentToolResult = {
  applied: boolean;
  appliedCount: number;
  invalidPaths: string[];
  resolvedAt: string;
};

const isCustomTokenPath = (path: string): boolean => {
  if (!path.startsWith("custom.")) {
    return false;
  }

  const [, key] = path.split("custom.");
  return Boolean(key?.trim());
};

export const isTokenPathValid = (
  tokens: TokenState,
  path: string
): boolean => {
  if (!path.trim()) {
    return false;
  }

  if (isCustomTokenPath(path)) {
    return true;
  }

  return getTokenPathValue(tokens, path) !== undefined;
};

export const buildTokenChangeSummary = (
  tokens: TokenState,
  changes: Record<string, string>
) => {
  const sortedEntries = Object.entries(changes).sort(([pathA], [pathB]) =>
    pathA.localeCompare(pathB)
  );

  const entries: TokenChangeEntry[] = sortedEntries
    .map(([rawPath, value]) => {
      const path = rawPath.trim();
      if (!path) {
        return null;
      }

      const fromValue = getTokenPathValue(tokens, path);
      const valid = isTokenPathValid(tokens, path);

      return {
        path,
        from: fromValue ?? null,
        to: value,
        valid,
      };
    })
    .filter((entry): entry is TokenChangeEntry => Boolean(entry));

  const invalidPaths = entries
    .filter((entry) => !entry.valid)
    .map((entry) => entry.path);

  const validChanges = entries.reduce<Record<string, string>>((acc, entry) => {
    if (entry.valid) {
      acc[entry.path] = entry.to;
    }
    return acc;
  }, {});

  return {
    entries,
    invalidPaths,
    validChanges,
  };
};
