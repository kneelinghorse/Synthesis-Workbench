import { create } from 'zustand';

import { DEFAULT_TOKEN_STATE, type TokenState } from '@/types/token-state';

export type TokenChange = {
  from: string;
  to: string;
};

export type TokenChangeSource =
  | 'manual'
  | 'stage1'
  | 'import'
  | 'migration'
  | 'system';

export type TokenHistoryEntry = {
  path: string;
  from: string;
  to: string;
  source: TokenChangeSource;
  at: string;
};

export type TokenSourceState = 'default' | TokenChangeSource;

export type CanonicalTokenStatus = 'canonical' | 'overridden' | 'missing';

export type TokenValueSource = 'canonical' | 'stage1' | 'manual';

export type TokenSourceAttribution = {
  path: string;
  current: string | null;
  source: TokenSourceState;
  values: Partial<Record<TokenValueSource, string>>;
  conflict: boolean;
  conflictingSources: TokenValueSource[];
};

export type TokenResetSource = TokenValueSource | 'default';

export type CanonicalTokenEntry = {
  path: string;
  canonical: string;
  current: string | null;
  status: CanonicalTokenStatus;
  source: TokenSourceState;
  values: Partial<Record<TokenValueSource, string>>;
  conflict: boolean;
  conflictingSources: TokenValueSource[];
};

export type CanonicalTokenSyncResult = {
  importedCount: number;
  appliedCount: number;
  preservedOverrideCount: number;
  invalidPaths: string[];
  entries: CanonicalTokenEntry[];
};

export type PersistedTokenSnapshot = {
  tokens: TokenState;
  changes: Record<string, TokenChange>;
  history: TokenHistoryEntry[];
  annotations: Record<string, string>;
};

type TokenNode = string | TokenRecord;

interface TokenRecord {
  [key: string]: TokenNode;
}

type TokenStateStore = {
  tokens: TokenState;
  changes: Record<string, TokenChange>;
  history: TokenHistoryEntry[];
  annotations: Record<string, string>;
  canonicalTokens: Record<string, string>;
  setToken: (path: string, value: string, source?: TokenChangeSource) => void;
  setTokens: (
    updates: Record<string, string> | Partial<TokenState>,
    source?: TokenChangeSource
  ) => void;
  setTokenAnnotation: (path: string, note: string) => void;
  syncCanonicalTokens: (
    canonicalTokens: Record<string, string>,
    options?: { preserveManualOverrides?: boolean }
  ) => CanonicalTokenSyncResult;
  getCanonicalEntries: (paths?: string[]) => CanonicalTokenEntry[];
  getTokenAttribution: (paths?: string[]) => TokenSourceAttribution[];
  resetTokenToSource: (path: string, source: TokenResetSource) => boolean;
  resetToken: (path: string) => void;
  resetAll: () => void;
  undoLastChange: () => boolean;
  hydrateFromSnapshot: (snapshot: PersistedTokenSnapshot) => void;
  getPersistedSnapshot: () => PersistedTokenSnapshot;
  toCssVariables: () => Record<string, string>;
  getChanges: () => Record<string, TokenChange>;
  getHistory: () => TokenHistoryEntry[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getNestedValue = (obj: TokenRecord, path: string): string | undefined => {
  if (!path) {
    return undefined;
  }

  const keys = path.split('.');
  let current: TokenNode | undefined = obj;

  for (const key of keys) {
    if (!current || typeof current === 'string') {
      return undefined;
    }

    const next: TokenNode | undefined = (current as TokenRecord)[key];
    if (next === undefined) {
      return undefined;
    }

    current = next;
  }

  return typeof current === 'string' ? current : undefined;
};

export const getTokenPathValue = (
  tokens: TokenState,
  path: string
): string | undefined => getNestedValue(tokens as unknown as TokenRecord, path);

const setNestedValue = <T extends TokenRecord>(
  obj: T,
  path: string,
  value: string
): T => {
  if (!path) {
    return obj;
  }

  const keys = path.split('.');
  const result: TokenRecord = { ...obj };
  let current: TokenRecord = result;

  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    const existing = current[key];
    current[key] = isRecord(existing) ? ({ ...existing } as TokenRecord) : {};
    current = current[key] as TokenRecord;
  }

  current[keys[keys.length - 1]] = value;
  return result as T;
};

const flattenToCssVars = (
  obj: TokenRecord,
  prefix = ''
): Record<string, string> => {
  const vars: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const varName = prefix ? `${prefix}-${key}` : key;

    if (isRecord(value)) {
      Object.assign(vars, flattenToCssVars(value as TokenRecord, varName));
    } else {
      vars[`--${varName}`] = String(value);
    }
  }

  return vars;
};

const flattenToTokenPaths = (
  obj: TokenRecord,
  prefix = ''
): Record<string, string> => {
  const paths: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value)) {
      Object.assign(paths, flattenToTokenPaths(value as TokenRecord, nextPrefix));
    } else {
      paths[nextPrefix] = String(value);
    }
  }

  return paths;
};

const normalizeTokenUpdates = (
  updates: Record<string, unknown>
): Record<string, string> => {
  const keys = Object.keys(updates);
  const hasDotPaths = keys.some((key) => key.includes('.'));
  if (hasDotPaths) {
    return Object.entries(updates).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        acc[key] = String(value);
        return acc;
      },
      {}
    );
  }

  const hasNestedObjects = Object.values(updates).some((value) => isRecord(value));
  if (hasNestedObjects) {
    return flattenToTokenPaths(updates as unknown as TokenRecord);
  }

  return Object.entries(updates).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      acc[key] = String(value);
      return acc;
    },
    {}
  );
};

const buildChangeMap = (tokens: TokenState): Record<string, TokenChange> => {
  const defaults = flattenToTokenPaths(
    DEFAULT_TOKEN_STATE as unknown as TokenRecord
  );
  const current = flattenToTokenPaths(tokens as unknown as TokenRecord);
  const allPaths = new Set([...Object.keys(defaults), ...Object.keys(current)]);

  const changes: Record<string, TokenChange> = {};
  for (const path of allPaths) {
    const from = defaults[path] ?? '';
    const to = current[path];
    if (to === undefined || to === from) {
      continue;
    }
    changes[path] = { from, to };
  }

  return changes;
};

const cloneSnapshot = (snapshot: PersistedTokenSnapshot): PersistedTokenSnapshot => ({
  tokens: JSON.parse(JSON.stringify(snapshot.tokens)),
  changes: JSON.parse(JSON.stringify(snapshot.changes)),
  history: [...snapshot.history],
  annotations: JSON.parse(JSON.stringify(snapshot.annotations ?? {})),
});

const makeHistoryEntry = (
  path: string,
  from: string,
  to: string,
  source: TokenChangeSource
): TokenHistoryEntry => ({
  path,
  from,
  to,
  source,
  at: new Date().toISOString(),
});

const isTokenPathKnown = (tokens: TokenState, path: string): boolean => {
  if (!path.trim()) {
    return false;
  }
  if (path.startsWith('custom.')) {
    return true;
  }
  return (
    getNestedValue(DEFAULT_TOKEN_STATE as unknown as TokenRecord, path) !== undefined ||
    getNestedValue(tokens as unknown as TokenRecord, path) !== undefined
  );
};

const buildLatestSourceMap = (
  history: TokenHistoryEntry[]
): Record<string, TokenChangeSource> => {
  return history.reduce<Record<string, TokenChangeSource>>((acc, entry) => {
    acc[entry.path] = entry.source;
    return acc;
  }, {});
};

const TOKEN_SOURCE_PRIORITY: Record<TokenSourceState, number> = {
  default: 0,
  import: 1,
  stage1: 2,
  manual: 3,
  migration: 3,
  system: 3,
};

const TOKEN_VALUE_SOURCE_ORDER: TokenValueSource[] = [
  'canonical',
  'stage1',
  'manual',
];

const getSourcePriority = (source: TokenSourceState): number =>
  TOKEN_SOURCE_PRIORITY[source] ?? 0;

const shouldApplyTokenUpdate = (
  currentSource: TokenSourceState,
  incomingSource: TokenChangeSource,
  force = false
): boolean => {
  if (force) {
    return true;
  }

  return getSourcePriority(incomingSource) >= getSourcePriority(currentSource);
};

const buildLatestValueMapBySource = (
  history: TokenHistoryEntry[]
): Record<string, Partial<Record<TokenValueSource, string>>> => {
  return history.reduce<Record<string, Partial<Record<TokenValueSource, string>>>>(
    (acc, entry) => {
      if (entry.source === 'manual') {
        acc[entry.path] = {
          ...(acc[entry.path] ?? {}),
          manual: entry.to,
        };
      } else if (entry.source === 'stage1') {
        acc[entry.path] = {
          ...(acc[entry.path] ?? {}),
          stage1: entry.to,
        };
      } else if (entry.source === 'import') {
        acc[entry.path] = {
          ...(acc[entry.path] ?? {}),
          canonical: entry.to,
        };
      }

      return acc;
    },
    {}
  );
};

const normalizePaths = (paths?: string[]): string[] | null => {
  if (!paths) {
    return null;
  }

  return Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b)
  );
};

const buildSourceValuesForPath = (
  path: string,
  canonicalTokens: Record<string, string>,
  valuesByPath: Record<string, Partial<Record<TokenValueSource, string>>>
): Partial<Record<TokenValueSource, string>> => {
  const fromHistory = valuesByPath[path] ?? {};
  const values: Partial<Record<TokenValueSource, string>> = {
    ...fromHistory,
  };

  if (canonicalTokens[path] !== undefined) {
    values.canonical = canonicalTokens[path];
  }

  return values;
};

const buildConflictingSources = (
  values: Partial<Record<TokenValueSource, string>>
): TokenValueSource[] => {
  const present = TOKEN_VALUE_SOURCE_ORDER.filter(
    (source) => values[source] !== undefined
  );
  if (present.length < 2) {
    return [];
  }

  const uniqueValues = new Set(
    present.map((source) => values[source] as string)
  );
  if (uniqueValues.size <= 1) {
    return [];
  }

  return present;
};

const buildTokenAttributionEntries = (
  tokens: TokenState,
  canonicalTokens: Record<string, string>,
  history: TokenHistoryEntry[],
  paths?: string[]
): TokenSourceAttribution[] => {
  const latestSources = buildLatestSourceMap(history);
  const valuesByPath = buildLatestValueMapBySource(history);
  const tokenRecord = tokens as unknown as TokenRecord;
  const requestedPaths = normalizePaths(paths);

  const selectedPaths =
    requestedPaths ??
    Array.from(
      new Set([
        ...Object.keys(flattenToTokenPaths(tokenRecord)),
        ...Object.keys(canonicalTokens),
        ...Object.keys(valuesByPath),
      ])
    ).sort((a, b) => a.localeCompare(b));

  return selectedPaths.map((path) => {
    const values = buildSourceValuesForPath(path, canonicalTokens, valuesByPath);
    const conflictingSources = buildConflictingSources(values);

    return {
      path,
      current: getNestedValue(tokenRecord, path) ?? null,
      source: latestSources[path] ?? 'default',
      values,
      conflict: conflictingSources.length > 0,
      conflictingSources,
    };
  });
};

const buildCanonicalEntries = (
  tokens: TokenState,
  canonicalTokens: Record<string, string>,
  history: TokenHistoryEntry[],
  paths?: string[]
): CanonicalTokenEntry[] => {
  const attributions = buildTokenAttributionEntries(
    tokens,
    canonicalTokens,
    history,
    paths
  );
  const tokenRecord = tokens as unknown as TokenRecord;
  const filtered = attributions.filter(
    (entry) => canonicalTokens[entry.path] !== undefined
  );

  return filtered.map((entry) => {
    const { path } = entry;
    const canonical = canonicalTokens[path];
    const current = getNestedValue(tokenRecord, path);
    const status: CanonicalTokenStatus =
      current === undefined
        ? 'missing'
        : current === canonical
          ? 'canonical'
          : 'overridden';

    return {
      path,
      canonical,
      current: current ?? null,
      status,
      source: entry.source,
      values: entry.values,
      conflict: entry.conflict,
      conflictingSources: entry.conflictingSources,
    };
  });
};

const applyTokenUpdates = (
  tokens: TokenState,
  history: TokenHistoryEntry[],
  updates: Record<string, string>,
  source: TokenChangeSource,
  options?: { force?: boolean }
): {
  tokens: TokenState;
  history: TokenHistoryEntry[];
  appliedCount: number;
  sourceByPath: Record<string, TokenChangeSource>;
} => {
  let nextTokens = tokens as unknown as TokenRecord;
  const nextHistory = [...history];
  const sourceByPath = buildLatestSourceMap(history);
  let appliedCount = 0;

  for (const [rawPath, rawValue] of Object.entries(updates)) {
    const path = rawPath.trim();
    if (!path) {
      continue;
    }

    const value = String(rawValue);
    const current = getNestedValue(nextTokens, path);
    if (current === value) {
      continue;
    }

    const currentSource = sourceByPath[path] ?? 'default';
    if (!shouldApplyTokenUpdate(currentSource, source, options?.force)) {
      continue;
    }

    nextTokens = setNestedValue(nextTokens, path, value);
    nextHistory.push(makeHistoryEntry(path, current ?? '', value, source));
    sourceByPath[path] = source;
    appliedCount += 1;
  }

  return {
    tokens: nextTokens as unknown as TokenState,
    history: nextHistory,
    appliedCount,
    sourceByPath,
  };
};

const resolveTokenValueForSource = (
  state: Pick<TokenStateStore, 'tokens' | 'canonicalTokens' | 'history'>,
  path: string,
  source: TokenResetSource
): { value: string; source: TokenChangeSource } | null => {
  const valuesByPath = buildLatestValueMapBySource(state.history);
  const fromHistory = valuesByPath[path];

  if (source === 'canonical') {
    const canonical = state.canonicalTokens[path] ?? fromHistory?.canonical;
    if (canonical === undefined) {
      return null;
    }
    return { value: canonical, source: 'import' };
  }

  if (source === 'stage1') {
    if (fromHistory?.stage1 === undefined) {
      return null;
    }
    return { value: fromHistory.stage1, source: 'stage1' };
  }

  if (source === 'manual') {
    if (fromHistory?.manual === undefined) {
      return null;
    }
    return { value: fromHistory.manual, source: 'manual' };
  }

  const defaultValue = getNestedValue(
    DEFAULT_TOKEN_STATE as unknown as TokenRecord,
    path
  );
  if (defaultValue === undefined) {
    return null;
  }

  return { value: defaultValue, source: 'system' };
};

export const useTokenStateStore = create<TokenStateStore>((set, get) => ({
  tokens: DEFAULT_TOKEN_STATE,
  changes: {},
  history: [],
  annotations: {},
  canonicalTokens: {},
  setToken: (path, value, source = 'manual') => {
    set((state) => {
      const applied = applyTokenUpdates(
        state.tokens,
        state.history,
        {
          [path]: value,
        },
        source
      );
      if (applied.appliedCount === 0) {
        return state;
      }

      return {
        tokens: applied.tokens,
        changes: buildChangeMap(applied.tokens),
        history: applied.history,
      };
    });
  },
  setTokens: (updates, source = 'manual') => {
    set((state) => {
      const normalizedUpdates = normalizeTokenUpdates(
        updates as Record<string, unknown>
      );
      const applied = applyTokenUpdates(
        state.tokens,
        state.history,
        normalizedUpdates,
        source
      );
      if (applied.appliedCount === 0) {
        return state;
      }

      return {
        tokens: applied.tokens,
        changes: buildChangeMap(applied.tokens),
        history: applied.history,
      };
    });
  },
  setTokenAnnotation: (path, note) => {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      return;
    }

    const normalizedNote = note.trim();
    set((state) => {
      const nextAnnotations = { ...state.annotations };
      if (normalizedNote) {
        nextAnnotations[normalizedPath] = normalizedNote;
      } else {
        delete nextAnnotations[normalizedPath];
      }

      if (
        state.annotations[normalizedPath] === nextAnnotations[normalizedPath] &&
        Object.keys(state.annotations).length === Object.keys(nextAnnotations).length
      ) {
        return state;
      }

      return {
        annotations: nextAnnotations,
      };
    });
  },
  syncCanonicalTokens: (
    canonicalTokens,
    _options = { preserveManualOverrides: true }
  ) => {
    const state = get();
    const importedCanonical: Record<string, string> = {};
    const invalidPaths: string[] = [];
    let preservedOverrideCount = 0;

    for (const [rawPath, rawValue] of Object.entries(canonicalTokens)) {
      const path = rawPath.trim();
      if (!path) {
        continue;
      }

      if (!isTokenPathKnown(state.tokens, path)) {
        invalidPaths.push(path);
        continue;
      }

      importedCanonical[path] = String(rawValue);
    }

    const applied = applyTokenUpdates(
      state.tokens,
      state.history,
      importedCanonical,
      'import'
    );

    const latestSources = buildLatestSourceMap(state.history);
    for (const [path, value] of Object.entries(importedCanonical)) {
      const current = getNestedValue(state.tokens as unknown as TokenRecord, path);
      if (current === undefined || current === value) {
        continue;
      }

      const latestSource = latestSources[path] ?? 'default';
      if (latestSource === 'manual') {
        preservedOverrideCount += 1;
      }
    }

    const entries = buildCanonicalEntries(
      applied.tokens,
      importedCanonical,
      applied.history
    );

    set({
      tokens: applied.tokens,
      changes: buildChangeMap(applied.tokens),
      history: applied.history,
      canonicalTokens: importedCanonical,
    });

    return {
      importedCount: Object.keys(importedCanonical).length,
      appliedCount: applied.appliedCount,
      preservedOverrideCount,
      invalidPaths: Array.from(new Set(invalidPaths)).sort((a, b) =>
        a.localeCompare(b)
      ),
      entries,
    };
  },
  getCanonicalEntries: (paths) =>
    buildCanonicalEntries(
      get().tokens,
      get().canonicalTokens,
      get().history,
      paths
    ),
  getTokenAttribution: (paths) =>
    buildTokenAttributionEntries(
      get().tokens,
      get().canonicalTokens,
      get().history,
      paths
    ),
  resetTokenToSource: (path, source) => {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      return false;
    }

    const resolved = resolveTokenValueForSource(get(), normalizedPath, source);
    if (!resolved) {
      return false;
    }

    const current = getNestedValue(
      get().tokens as unknown as TokenRecord,
      normalizedPath
    );
    if (current === resolved.value) {
      return false;
    }

    set((state) => {
      const applied = applyTokenUpdates(
        state.tokens,
        state.history,
        { [normalizedPath]: resolved.value },
        resolved.source,
        { force: true }
      );
      if (applied.appliedCount === 0) {
        return state;
      }

      return {
        tokens: applied.tokens,
        changes: buildChangeMap(applied.tokens),
        history: applied.history,
      };
    });
    return true;
  },
  resetToken: (path) => {
    void get().resetTokenToSource(path, 'default');
  },
  resetAll: () =>
    set({
      tokens: DEFAULT_TOKEN_STATE,
      changes: {},
      history: [],
      annotations: {},
      canonicalTokens: {},
    }),
  undoLastChange: () => {
    let undone = false;

    set((state) => {
      const last = state.history[state.history.length - 1];
      if (!last) {
        return state;
      }

      const nextTokens = setNestedValue(
        state.tokens as unknown as TokenRecord,
        last.path,
        last.from
      ) as unknown as TokenState;

      undone = true;
      return {
        tokens: nextTokens,
        changes: buildChangeMap(nextTokens),
        history: state.history.slice(0, -1),
      };
    });

    return undone;
  },
  hydrateFromSnapshot: (snapshot) =>
    set(() => {
      const cloned = cloneSnapshot(snapshot);
      return {
        tokens: cloned.tokens,
        changes: buildChangeMap(cloned.tokens),
        history: cloned.history,
        annotations: cloned.annotations ?? {},
        canonicalTokens: {},
      };
    }),
  getPersistedSnapshot: () => {
    const state = get();
    return cloneSnapshot({
      tokens: state.tokens,
      changes: state.changes,
      history: state.history,
      annotations: state.annotations,
    });
  },
  toCssVariables: () => flattenToCssVars(get().tokens as unknown as TokenRecord),
  getChanges: () => get().changes,
  getHistory: () => get().history,
}));

export const resetTokenState = () => {
  useTokenStateStore.setState({
    tokens: DEFAULT_TOKEN_STATE,
    changes: {},
    history: [],
    annotations: {},
    canonicalTokens: {},
  });
};
