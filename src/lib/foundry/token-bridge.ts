import { DEFAULT_TOKEN_STATE } from "@/types/token-state";

type PrimitiveTokenValue = string | number | boolean;

export type FoundryTokenBridgeResult = {
  mappedTokens: Record<string, string>;
  unmappedPaths: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPrimitive = (value: unknown): value is PrimitiveTokenValue =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const flattenTokenPaths = (
  value: unknown,
  prefix = "",
  acc: string[] = []
): string[] => {
  if (isPrimitive(value)) {
    if (prefix) {
      acc.push(prefix);
    }
    return acc;
  }

  if (!isRecord(value)) {
    return acc;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    flattenTokenPaths(nested, nextPrefix, acc);
  }

  return acc;
};

const flattenFoundryTokenPayload = (
  value: unknown,
  prefix = "",
  acc: Record<string, string> = {}
): Record<string, string> => {
  if (isPrimitive(value)) {
    if (prefix) {
      acc[prefix] = String(value);
    }
    return acc;
  }

  if (!isRecord(value)) {
    return acc;
  }

  const tokenValue = value.value ?? value.$value;
  if (prefix && isPrimitive(tokenValue)) {
    acc[prefix] = String(tokenValue);
    return acc;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (key === "value" || key === "$value" || key === "description") {
      continue;
    }
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    flattenFoundryTokenPayload(nested, nextPrefix, acc);
  }

  return acc;
};

const sanitizePath = (value: string): string =>
  value
    .trim()
    .replace(/\[(.+?)\]/g, ".$1")
    .replace(/::/g, ".")
    .replace(/[/:]/g, ".")
    .replace(/\s+/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "");

const toLookupKey = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const KNOWN_TOKEN_PATHS = flattenTokenPaths(DEFAULT_TOKEN_STATE);

const KNOWN_TOKEN_PATH_SET = new Set(KNOWN_TOKEN_PATHS);

const LOOKUP_INDEX = KNOWN_TOKEN_PATHS.reduce<Map<string, string | null>>(
  (acc, path) => {
    const key = toLookupKey(path);
    const existing = acc.get(key);
    if (existing && existing !== path) {
      acc.set(key, null);
      return acc;
    }
    if (!existing) {
      acc.set(key, path);
    }
    return acc;
  },
  new Map<string, string | null>()
);

const PREFIXES = [
  "tokens.",
  "token.",
  "theme.",
  "themes.",
  "values.",
  "value.",
  "semantic.",
  "semantics.",
  "global.",
  "primitive.",
  "primitives.",
  "foundation.",
];

const removeKnownPrefixes = (path: string): string[] => {
  const results: string[] = [];
  let candidate = path;
  results.push(candidate);

  let removed = true;
  while (removed) {
    removed = false;
    for (const prefix of PREFIXES) {
      if (candidate.toLowerCase().startsWith(prefix)) {
        candidate = candidate.slice(prefix.length);
        results.push(candidate);
        removed = true;
      }
    }
  }

  return results;
};

const applyAliases = (path: string): string[] => {
  const aliasCandidates = [path];
  aliasCandidates.push(path.replace(/^color\./i, "colors."));
  aliasCandidates.push(path.replace(/^space\./i, "spacing."));
  aliasCandidates.push(path.replace(/^radii\./i, "radius."));
  aliasCandidates.push(path.replace(/^radiuses\./i, "radius."));
  aliasCandidates.push(path.replace(/^shadows\./i, "shadow."));
  aliasCandidates.push(path.replace(/^typography\.family\./i, "typography.fontFamily."));
  aliasCandidates.push(path.replace(/^typography\.size\./i, "typography.fontSize."));
  aliasCandidates.push(path.replace(/^typography\.weight\./i, "typography.fontWeight."));
  aliasCandidates.push(
    path.replace(/^typography\.lineheight\./i, "typography.lineHeight.")
  );
  aliasCandidates.push(path.replace(/^typography\.line-height\./i, "typography.lineHeight."));
  return aliasCandidates;
};

const resolveWorkbenchPath = (rawPath: string): string | null => {
  const sanitized = sanitizePath(rawPath);
  if (!sanitized) {
    return null;
  }

  const candidates = new Set<string>();
  candidates.add(sanitized);
  candidates.add(sanitized.replace(/-/g, "."));

  if (sanitized.startsWith("--")) {
    const withoutPrefix = sanitized.slice(2);
    candidates.add(withoutPrefix);
    candidates.add(withoutPrefix.replace(/-/g, "."));
  }

  for (const candidate of Array.from(candidates)) {
    for (const withoutPrefix of removeKnownPrefixes(candidate)) {
      candidates.add(withoutPrefix);
      candidates.add(withoutPrefix.replace(/-/g, "."));
      for (const alias of applyAliases(withoutPrefix)) {
        candidates.add(alias);
      }
    }
  }

  for (const candidate of candidates) {
    if (candidate.startsWith("custom.")) {
      return candidate;
    }
    if (KNOWN_TOKEN_PATH_SET.has(candidate)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    const lookup = LOOKUP_INDEX.get(toLookupKey(candidate));
    if (lookup) {
      return lookup;
    }
  }

  return null;
};

export const mapFoundryTokensToWorkbenchPaths = (
  tokens: unknown
): FoundryTokenBridgeResult => {
  const flattened = flattenFoundryTokenPayload(tokens);
  const mappedTokens: Record<string, string> = {};
  const unmappedPaths: string[] = [];

  for (const [rawPath, value] of Object.entries(flattened)) {
    const mappedPath = resolveWorkbenchPath(rawPath);
    if (!mappedPath) {
      unmappedPaths.push(rawPath);
      continue;
    }

    mappedTokens[mappedPath] = value;
  }

  return {
    mappedTokens,
    unmappedPaths: Array.from(new Set(unmappedPaths)).sort((a, b) =>
      a.localeCompare(b)
    ),
  };
};
