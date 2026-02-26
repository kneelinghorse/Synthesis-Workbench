import { create } from "zustand";

import { buildTokenChangeSummary } from "@/lib/runtime/tools/token-tools";
import { useTokenStateStore } from "@/lib/stores/token-state";
import type { TokenState } from "@/types/token-state";
import type {
  Stage1BundleInput,
  Stage1BundleLoadResult,
  Stage1BundlePayload,
  Stage1Component,
  Stage1ComponentClusterEntry,
  Stage1Manifest,
  Stage1TokenSeedResult,
} from "@/types/stage1-bundle";

type Stage1BundleState = {
  bundle: Stage1BundlePayload | null;
  manifest: Stage1Manifest | null;
  components: Stage1Component[];
  tokenSuggestions: Record<string, string>;
  error: string | null;
  loadedAt: string | null;
  loadBundle: (input: Stage1BundleInput) => Stage1BundleLoadResult;
  seedTokenState: () => Stage1TokenSeedResult;
  reset: () => void;
};

type ArtifactCandidate = {
  type: string | null;
  label: string;
  source: string;
  payload: unknown;
};

const TOKEN_SECTION_KEYS = [
  "colors",
  "typography",
  "spacing",
  "radius",
  "shadow",
  "custom",
];

const SPACING_TOKENS = ["xs", "sm", "md", "lg", "xl", "2xl"];

const COLOR_TOKENS = [
  "primary",
  "secondary",
  "accent",
  "background",
  "surface",
];

const MAX_SPACING_CANDIDATE_PX = 96;
const TYPOGRAPHY_BASE_TARGET_PX = 16;
const FULL_RADIUS_MIN_PX = 999;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPrimitive = (value: unknown): value is string | number | boolean =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
};

const toNumberValue = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

type TokenCandidate = {
  value: string;
  token: boolean;
};

const formatPxValue = (value: unknown): string | null => {
  const px = toNumberValue(value);
  if (px === undefined) {
    return null;
  }
  return `${Number.isInteger(px) ? String(px) : String(px)}px`;
};

const extractTokenCandidates = (
  value: unknown,
  resolver: (entry: Record<string, unknown>) => string | null
): TokenCandidate[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<TokenCandidate[]>((acc, entry) => {
    if (!isRecord(entry)) {
      return acc;
    }

    const resolved = resolver(entry);
    if (!resolved) {
      return acc;
    }

    acc.push({ value: resolved, token: entry.token === true });
    return acc;
  }, []);
};

const prioritizeTokenCandidates = (candidates: TokenCandidate[]): string[] => {
  return [
    ...candidates.filter((candidate) => candidate.token),
    ...candidates.filter((candidate) => !candidate.token),
  ].map((candidate) => candidate.value);
};

const dedupeValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
};

type NumericScaleValue = {
  value: string;
  numeric: number;
};

const toNumericScaleValues = (values: string[]): NumericScaleValue[] => {
  return dedupeValues(values)
    .map((value) => ({
      value,
      numeric: Number.parseFloat(value),
    }))
    .filter((entry) => Number.isFinite(entry.numeric))
    .sort((a, b) => a.numeric - b.numeric);
};

const looksLikeStage1StyleFingerprint = (value: Record<string, unknown>) => {
  const kind = toStringValue(value.kind);
  return (
    kind === "style_fingerprint" ||
    "type_scale" in value ||
    "spacing_scale" in value ||
    "sample_counts" in value
  );
};

const extractStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (isRecord(entry)) {
          return (
            toStringValue(entry.value) ??
            toStringValue(entry.name) ??
            toStringValue(entry.label)
          );
        }
        return null;
      })
      .filter((entry): entry is string => Boolean(entry));
  }

  if (typeof value === "string") {
    return [value];
  }

  if (isRecord(value)) {
    if (Array.isArray(value.items)) {
      return extractStringArray(value.items);
    }
    if (Array.isArray(value.values)) {
      return extractStringArray(value.values);
    }
  }

  return [];
};

const extractColorArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (isRecord(entry)) {
          return (
            toStringValue(entry.value) ??
            toStringValue(entry.hex) ??
            toStringValue(entry.color)
          );
        }
        return null;
      })
      .filter((entry): entry is string => Boolean(entry));
  }

  if (typeof value === "string") {
    return [value];
  }

  return [];
};

const flattenTokenValues = (
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

  for (const [key, nested] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (isPrimitive(nested)) {
      acc[nextPrefix] = String(nested);
    } else if (isRecord(nested)) {
      flattenTokenValues(nested, nextPrefix, acc);
    }
  }

  return acc;
};

const isFlatTokenMap = (record: Record<string, unknown>) =>
  Object.values(record).every((value) => isPrimitive(value) || value === null);

const hasTokenSection = (record: Record<string, unknown>) =>
  TOKEN_SECTION_KEYS.some((key) => key in record);

const extractTokenSuggestionsFromArray = (
  value: unknown[]
): Record<string, string> => {
  return value.reduce<Record<string, string>>((acc, entry) => {
    if (!isRecord(entry)) {
      return acc;
    }

    const path =
      toStringValue(entry.path) ??
      toStringValue(entry.token) ??
      toStringValue(entry.name) ??
      toStringValue(entry.id);
    const suggestion =
      toStringValue(entry.value) ??
      toStringValue(entry.tokenValue) ??
      toStringValue(entry.suggestion);

    if (!path || !suggestion) {
      return acc;
    }

    acc[path] = suggestion;
    return acc;
  }, {});
};

const extractTokenSuggestionMap = (value: unknown): Record<string, string> => {
  if (Array.isArray(value)) {
    return extractTokenSuggestionsFromArray(value);
  }

  if (!isRecord(value)) {
    return {};
  }

  const nestedCandidate =
    (isRecord(value.tokens) && value.tokens) ||
    (isRecord(value.tokenGuess) && value.tokenGuess) ||
    (isRecord(value.tokenSuggestions) && value.tokenSuggestions) ||
    (isRecord(value.suggestions) && value.suggestions) ||
    (isRecord(value.values) && value.values);

  if (nestedCandidate) {
    return flattenTokenValues(nestedCandidate);
  }

  if (isFlatTokenMap(value)) {
    return Object.entries(value).reduce<Record<string, string>>(
      (acc, [key, rawValue]) => {
        if (rawValue === null) return acc;
        acc[key] = String(rawValue);
        return acc;
      },
      {}
    );
  }

  if (hasTokenSection(value)) {
    return flattenTokenValues(value);
  }

  return {};
};

const isTokenGuessArtifact = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return toStringValue(value.kind) === "token_guess" && isRecord(value.tokens);
};

const handleTokenGuessPayload = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {};
  if (toStringValue(value.kind) !== "token_guess") return {};

  const tokens = value.tokens;
  if (!isRecord(tokens)) return {};

  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(tokens)) {
    if (typeof val === "string") {
      result[key] = val;
    } else if (isPrimitive(val)) {
      result[key] = String(val);
    }
  }
  return result;
};

const isComponentClustersArtifact = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return (
    toStringValue(value.kind) === "component_clusters" &&
    Array.isArray(value.clusters)
  );
};

const handleComponentClustersPayload = (
  value: unknown,
  source: string
): Stage1Component[] => {
  if (!isRecord(value)) return [];
  if (toStringValue(value.kind) !== "component_clusters") return [];

  const clusters = value.clusters;
  if (!Array.isArray(clusters)) return [];

  return clusters
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => buildComponentFromCluster(entry, source))
    .filter((entry): entry is Stage1Component => entry !== null);
};

const buildComponentFromCluster = (
  entry: Record<string, unknown>,
  source: string
): Stage1Component | null => {
  const name =
    toStringValue(entry.name) ??
    toStringValue(entry.patternName) ??
    toStringValue(entry.pattern_name) ??
    toStringValue(entry.tagName) ??
    toStringValue(entry.tag_name) ??
    toStringValue(entry.clusterId) ??
    toStringValue(entry.cluster_id);
  if (!name) return null;

  const count =
    toNumberValue(entry.count) ??
    toNumberValue(entry.totalInstances) ??
    toNumberValue(entry.total_instances) ??
    toNumberValue(entry.instanceCount) ??
    toNumberValue(entry.instance_count);
  const confidence = toNumberValue(entry.confidence);
  const parentCluster =
    toStringValue(entry.parent_cluster) ??
    toStringValue(entry.parentCluster) ??
    null;

  const rawSelectors = isRecord(entry.selectors) ? entry.selectors : null;
  const selectors = rawSelectors
    ? {
        css: toStringValue(rawSelectors.css) ?? undefined,
        testId: toStringValue(rawSelectors.testId) ?? undefined,
        role: toStringValue(rawSelectors.role) ?? undefined,
      }
    : undefined;

  const variants = Array.isArray(entry.variants)
    ? entry.variants.filter((v): v is string => typeof v === "string")
    : undefined;

  return {
    name,
    count,
    source,
    confidence,
    selectors,
    parentCluster,
    variants: variants && variants.length > 0 ? variants : undefined,
  };
};

const extractTokenSuggestionsFromFingerprint = (
  fingerprint: unknown
): Record<string, string> => {
  if (!isRecord(fingerprint)) {
    return {};
  }

  const isStage1Fingerprint = looksLikeStage1StyleFingerprint(fingerprint);
  const direct = extractTokenSuggestionMap(fingerprint);
  if (!isStage1Fingerprint && Object.keys(direct).length > 0) {
    return direct;
  }

  const suggestions: Record<string, string> = {};
  const colorSection = isRecord(fingerprint.colors) ? fingerprint.colors : null;
  const resolveColorValue = (entry: Record<string, unknown>) =>
    toStringValue(entry.value) ??
    toStringValue(entry.color) ??
    toStringValue(entry.hex);

  const textColorCandidates = extractTokenCandidates(
    colorSection?.text,
    resolveColorValue
  );
  const backgroundColorCandidates = extractTokenCandidates(
    colorSection?.background,
    resolveColorValue
  );

  if (textColorCandidates.length > 0 || backgroundColorCandidates.length > 0) {
    const textColors = dedupeValues(
      prioritizeTokenCandidates(textColorCandidates)
    );
    const backgroundColors = dedupeValues(
      prioritizeTokenCandidates(backgroundColorCandidates)
    );
    const combinedColors = dedupeValues(
      prioritizeTokenCandidates([
        ...textColorCandidates,
        ...backgroundColorCandidates,
      ])
    );

    COLOR_TOKENS.slice(0, 3).forEach((tokenKey, index) => {
      const value = textColors[index];
      if (value) {
        suggestions[`colors.${tokenKey}`] = value;
      }
    });

    COLOR_TOKENS.slice(3).forEach((tokenKey, index) => {
      const value = backgroundColors[index];
      if (value) {
        suggestions[`colors.${tokenKey}`] = value;
      }
    });

    const usedValues = new Set(Object.values(suggestions));
    for (const tokenKey of COLOR_TOKENS) {
      const path = `colors.${tokenKey}`;
      if (suggestions[path]) {
        continue;
      }
      const nextValue = combinedColors.find((value) => !usedValues.has(value));
      if (!nextValue) {
        break;
      }
      suggestions[path] = nextValue;
      usedValues.add(nextValue);
    }
  } else {
    const colors = extractColorArray(
      fingerprint.colors ?? fingerprint.palette ?? fingerprint.colorPalette
    );

    colors.slice(0, COLOR_TOKENS.length).forEach((color, index) => {
      const tokenKey = COLOR_TOKENS[index];
      suggestions[`colors.${tokenKey}`] = color;
    });
  }

  const typeScale = isRecord(fingerprint.type_scale) ? fingerprint.type_scale : null;
  const fonts = extractStringArray(
    typeScale?.font_families ??
      fingerprint.fonts ??
      fingerprint.fontFamilies ??
      fingerprint.fontFamily
  );
  if (fonts[0]) {
    suggestions["typography.fontFamily.sans"] = fonts[0];
  }
  const monoFont = fonts.find((family) =>
    /(mono|code|courier|menlo|consolas)/i.test(family)
  );
  if (monoFont && monoFont !== fonts[0]) {
    suggestions["typography.fontFamily.mono"] = monoFont;
  } else if (fonts[1]) {
    suggestions["typography.fontFamily.mono"] = fonts[1];
  }

  const fontSizeCandidates = extractTokenCandidates(typeScale?.font_sizes, (entry) =>
    formatPxValue(entry.px ?? entry.value)
  );
  const fontSizes = toNumericScaleValues(
    fontSizeCandidates.length > 0
      ? prioritizeTokenCandidates(fontSizeCandidates)
      : extractStringArray(
          typeScale?.fontSizes ??
            fingerprint.fontSizes ??
            fingerprint.typography
        )
  ).filter((entry) => entry.numeric > 0);

  if (fontSizes.length > 0) {
    const baseIndex = fontSizes.reduce((closestIndex, entry, index) => {
      const closest = fontSizes[closestIndex];
      if (!closest) {
        return index;
      }

      const currentDistance = Math.abs(entry.numeric - TYPOGRAPHY_BASE_TARGET_PX);
      const closestDistance = Math.abs(
        closest.numeric - TYPOGRAPHY_BASE_TARGET_PX
      );
      return currentDistance < closestDistance ? index : closestIndex;
    }, 0);

    const baseSize = fontSizes[baseIndex];
    if (baseSize) {
      suggestions["typography.fontSize.base"] = baseSize.value;

      const smaller = fontSizes.slice(0, baseIndex);
      const larger = fontSizes.slice(baseIndex + 1);

      const sm = smaller.at(-1);
      const xs = smaller.at(-2);
      if (sm) suggestions["typography.fontSize.sm"] = sm.value;
      if (xs) suggestions["typography.fontSize.xs"] = xs.value;

      const lg = larger[0];
      const xl = larger[1];
      const xxl = larger[2];
      const xxxl = larger[3];
      if (lg) suggestions["typography.fontSize.lg"] = lg.value;
      if (xl) suggestions["typography.fontSize.xl"] = xl.value;
      if (xxl) suggestions["typography.fontSize.2xl"] = xxl.value;
      if (xxxl) suggestions["typography.fontSize.3xl"] = xxxl.value;
    }
  }

  const lineHeightCandidates = extractTokenCandidates(typeScale?.line_heights, (entry) =>
    formatPxValue(entry.px ?? entry.value)
  );
  const lineHeights = toNumericScaleValues(
    lineHeightCandidates.length > 0
      ? prioritizeTokenCandidates(lineHeightCandidates)
      : extractStringArray(
          typeScale?.lineHeights ??
            fingerprint.lineHeights ??
            fingerprint.lineHeight
        )
  ).filter((entry) => entry.numeric > 0);

  if (lineHeights.length > 0) {
    const baseFontSize = suggestions["typography.fontSize.base"];
    const baseFontPx = baseFontSize ? toNumberValue(baseFontSize) : undefined;
    const normalTarget = baseFontPx ? baseFontPx * 1.5 : 24;

    const normalIndex = lineHeights.reduce((closestIndex, entry, index) => {
      const closest = lineHeights[closestIndex];
      if (!closest) {
        return index;
      }

      const currentDistance = Math.abs(entry.numeric - normalTarget);
      const closestDistance = Math.abs(closest.numeric - normalTarget);
      return currentDistance < closestDistance ? index : closestIndex;
    }, 0);

    const normal = lineHeights[normalIndex];
    if (normal) {
      suggestions["typography.lineHeight.normal"] = normal.value;
    }

    const tight = lineHeights[normalIndex - 1];
    if (tight) {
      suggestions["typography.lineHeight.tight"] = tight.value;
    }

    const relaxed = lineHeights[normalIndex + 1];
    if (relaxed) {
      suggestions["typography.lineHeight.relaxed"] = relaxed.value;
    }
  }

  const spacingScale = isRecord(fingerprint.spacing_scale)
    ? fingerprint.spacing_scale
    : null;
  const spacingCandidates = [
    ...extractTokenCandidates(spacingScale?.padding, (entry) =>
      formatPxValue(entry.px ?? entry.value)
    ),
    ...extractTokenCandidates(spacingScale?.margin, (entry) =>
      formatPxValue(entry.px ?? entry.value)
    ),
  ];
  const rawSpacing =
    spacingCandidates.length > 0
      ? dedupeValues(prioritizeTokenCandidates(spacingCandidates))
      : extractStringArray(
          fingerprint.spacing ?? fingerprint.space ?? fingerprint.spacings
        );
  const spacingScaleValues = toNumericScaleValues(rawSpacing);
  const zeroSpacing = spacingScaleValues.find((entry) => entry.numeric === 0);
  const positiveSpacing = spacingScaleValues.filter((entry) => entry.numeric > 0);
  const boundedPositive = positiveSpacing.filter(
    (entry) => entry.numeric <= MAX_SPACING_CANDIDATE_PX
  );
  const selectedPositive = (
    boundedPositive.length > 0 ? boundedPositive : positiveSpacing
  ).map((entry) => entry.value);

  const spacingValues = [
    ...(zeroSpacing ? [zeroSpacing.value] : []),
    ...selectedPositive,
  ].slice(0, SPACING_TOKENS.length);

  spacingValues.forEach((value, index) => {
    const tokenKey = SPACING_TOKENS[index];
    suggestions[`spacing.${tokenKey}`] = value;
  });

  const radiusCandidates = extractTokenCandidates(
    fingerprint.radii ?? fingerprint.radius ?? fingerprint.borderRadius,
    (entry) => formatPxValue(entry.px ?? entry.value)
  );
  const radii = toNumericScaleValues(
    radiusCandidates.length > 0
      ? prioritizeTokenCandidates(radiusCandidates)
      : extractStringArray(
          fingerprint.radii ?? fingerprint.radius ?? fingerprint.borderRadius
        )
  );

  if (radii.length > 0) {
    const zero = radii.find((entry) => entry.numeric === 0);
    const positive = radii.filter((entry) => entry.numeric > 0);

    suggestions["radius.none"] = zero?.value ?? radii[0]?.value ?? "0";
    if (positive[0]) suggestions["radius.sm"] = positive[0].value;
    if (positive[1]) suggestions["radius.md"] = positive[1].value;
    if (positive[2]) suggestions["radius.lg"] = positive[2].value;

    const full = positive.find((entry) => entry.numeric >= FULL_RADIUS_MIN_PX);
    if (full) {
      suggestions["radius.full"] = full.value;
    }
  }

  return suggestions;
};

const buildArtifactCandidates = (
  bundle: Stage1BundlePayload
): ArtifactCandidate[] => {
  const candidates: ArtifactCandidate[] = [];
  const artifacts = bundle.artifacts;

  if (Array.isArray(artifacts)) {
    for (const entry of artifacts) {
      if (!isRecord(entry)) {
        continue;
      }

      const labelParts = [
        toStringValue(entry.id),
        toStringValue(entry.path),
        toStringValue(entry.type),
        toStringValue(entry.kind),
        toStringValue(entry.name),
        toStringValue(entry.role),
      ].filter((value): value is string => Boolean(value));

      const label = labelParts.join(" ").toLowerCase();
      const source = labelParts[0] ?? toStringValue(entry.path) ?? "artifact";
      const payload =
        entry.payload ?? entry.data ?? entry.content ?? entry;

      candidates.push({
        type: toStringValue(entry.type),
        label,
        source,
        payload,
      });
    }
  } else if (isRecord(artifacts)) {
    for (const [key, value] of Object.entries(artifacts)) {
      candidates.push({
        type: null,
        label: key.toLowerCase(),
        source: key,
        payload: value,
      });
    }
  }

  return candidates;
};

const buildComponentEntry = (
  value: unknown,
  source: string
): Stage1Component | null => {
  if (typeof value === "string") {
    return {
      name: value,
      source,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const name =
    toStringValue(value.name) ??
    toStringValue(value.component) ??
    toStringValue(value.label) ??
    toStringValue(value.id);

  if (!name) {
    return null;
  }

  const count = toNumberValue(
    value.count ?? value.instances ?? value.usage ?? value.samples
  );

  const id = toStringValue(value.id);

  return {
    id: id ?? undefined,
    name,
    count,
    source,
  };
};

const extractComponentsFromValue = (
  value: unknown,
  source: string
): Stage1Component[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => buildComponentEntry(entry, source))
      .filter((entry): entry is Stage1Component => Boolean(entry));
  }

  if (!isRecord(value)) {
    return [];
  }

  const possibleLists = [
    value.components,
    value.clusters,
    value.items,
    value.nodes,
  ];

  for (const list of possibleLists) {
    if (Array.isArray(list)) {
      return extractComponentsFromValue(list, source);
    }
  }

  return [];
};

const dedupeComponents = (components: Stage1Component[]): Stage1Component[] => {
  const map = new Map<string, Stage1Component>();

  for (const component of components) {
    const key = component.name.trim().toLowerCase();
    if (!key) {
      continue;
    }

    const existing = map.get(key);
    if (!existing) {
      map.set(key, component);
      continue;
    }

    const existingCount = existing.count ?? 0;
    const nextCount = component.count ?? 0;

    map.set(key, {
      ...existing,
      count: Math.max(existingCount, nextCount) || existing.count || component.count,
      source: existing.source ?? component.source,
      id: existing.id ?? component.id,
      confidence: existing.confidence ?? component.confidence,
      selectors: existing.selectors ?? component.selectors,
      parentCluster: existing.parentCluster ?? component.parentCluster,
      variants: existing.variants ?? component.variants,
    });
  }

  return Array.from(map.values());
};

const extractComponents = (
  bundle: Stage1BundlePayload,
  artifacts: ArtifactCandidate[]
): Stage1Component[] => {
  const components: Stage1Component[] = [];

  components.push(...extractComponentsFromValue(bundle.components, "bundle"));

  if (isRecord(bundle.evidence)) {
    components.push(
      ...extractComponentsFromValue(
        bundle.evidence.components ??
          bundle.evidence.componentClusters ??
          bundle.evidence.clusters,
        "evidence"
      )
    );
  }

  if (isRecord(bundle.synthesis)) {
    components.push(
      ...extractComponentsFromValue(
        bundle.synthesis.components ?? bundle.synthesis.clusters,
        "synthesis"
      )
    );
  }

  for (const artifact of artifacts) {
    if (
      artifact.type === "component_clusters" ||
      isComponentClustersArtifact(artifact.payload)
    ) {
      components.push(
        ...handleComponentClustersPayload(artifact.payload, artifact.source)
      );
      continue;
    }

    if (
      !artifact.label.includes("component") &&
      !artifact.label.includes("cluster")
    ) {
      continue;
    }
    components.push(
      ...extractComponentsFromValue(artifact.payload, artifact.source)
    );
  }

  return dedupeComponents(components);
};

const extractTokenSuggestions = (
  bundle: Stage1BundlePayload,
  artifacts: ArtifactCandidate[]
): Record<string, string> => {
  const suggestions: Record<string, string> = {};

  const fingerprint =
    bundle.styleFingerprint ??
    (isRecord(bundle.synthesis) ? bundle.synthesis.styleFingerprint : undefined) ??
    (isRecord(bundle.evidence) ? bundle.evidence.styleFingerprint : undefined);

  Object.assign(suggestions, extractTokenSuggestionsFromFingerprint(fingerprint));

  const tokenSources = [
    bundle.tokenSuggestions,
    bundle.tokenGuess,
    isRecord(bundle.synthesis) ? bundle.synthesis.tokenSuggestions : undefined,
    isRecord(bundle.synthesis) ? bundle.synthesis.tokenGuess : undefined,
    isRecord(bundle.synthesis) ? bundle.synthesis.tokens : undefined,
  ];

  for (const source of tokenSources) {
    Object.assign(suggestions, extractTokenSuggestionMap(source));
  }

  for (const artifact of artifacts) {
    if (
      artifact.type === "token_guess" ||
      isTokenGuessArtifact(artifact.payload)
    ) {
      Object.assign(suggestions, handleTokenGuessPayload(artifact.payload));
      continue;
    }

    if (
      artifact.label.includes("token-guess") ||
      artifact.label.includes("token_guess")
    ) {
      Object.assign(suggestions, extractTokenSuggestionMap(artifact.payload));
      continue;
    }

    if (
      artifact.label.includes("style-fingerprint") ||
      artifact.label.includes("style_fingerprint") ||
      artifact.label.includes("fingerprint")
    ) {
      Object.assign(
        suggestions,
        extractTokenSuggestionsFromFingerprint(artifact.payload)
      );
    }
  }

  return suggestions;
};

const parseBundleInput = (
  input: Stage1BundleInput
): { bundle: Stage1BundlePayload | null; errors: string[] } => {
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (!isRecord(parsed)) {
        return {
          bundle: null,
          errors: ["Stage1 bundle must be a JSON object."],
        };
      }

      if (!isRecord(parsed.manifest)) {
        return {
          bundle: null,
          errors: ["Stage1 bundle is missing a manifest object."],
        };
      }

      return { bundle: parsed as Stage1BundlePayload, errors: [] };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        bundle: null,
        errors: [`Stage1 bundle JSON failed to parse: ${detail}`],
      };
    }
  }

  if (!isRecord(input)) {
    return {
      bundle: null,
      errors: ["Stage1 bundle must be an object or JSON string."],
    };
  }

  if (!isRecord(input.manifest)) {
    return {
      bundle: null,
      errors: ["Stage1 bundle is missing a manifest object."],
    };
  }

  return { bundle: input as Stage1BundlePayload, errors: [] };
};

const emptyLoadResult = (error: string): Stage1BundleLoadResult => ({
  ok: false,
  componentCount: 0,
  tokenSuggestionCount: 0,
  components: [],
  tokenSuggestions: {},
  errors: [error],
});

const INITIAL_STATE: Omit<Stage1BundleState, "loadBundle" | "seedTokenState" | "reset"> =
  {
    bundle: null,
    manifest: null,
    components: [],
    tokenSuggestions: {},
    error: null,
    loadedAt: null,
  };

export const useStage1BundleStore = create<Stage1BundleState>((set, get) => ({
  ...INITIAL_STATE,
  loadBundle: (input) => {
    const parsed = parseBundleInput(input);
    if (!parsed.bundle) {
      const error = parsed.errors[0] ?? "Invalid Stage1 bundle.";
      set({
        ...INITIAL_STATE,
        error,
      });
      return emptyLoadResult(error);
    }

    const artifacts = buildArtifactCandidates(parsed.bundle);
    const tokenSuggestions = extractTokenSuggestions(parsed.bundle, artifacts);
    const components = extractComponents(parsed.bundle, artifacts);
    const loadedAt = new Date().toISOString();

    set({
      bundle: parsed.bundle,
      manifest: parsed.bundle.manifest,
      components,
      tokenSuggestions,
      error: null,
      loadedAt,
    });

    return {
      ok: true,
      componentCount: components.length,
      tokenSuggestionCount: Object.keys(tokenSuggestions).length,
      components,
      tokenSuggestions,
      errors: [],
    };
  },
  seedTokenState: () => {
    const suggestions = get().tokenSuggestions;
    const tokens = useTokenStateStore.getState().tokens as TokenState;
    const { validChanges, invalidPaths } = buildTokenChangeSummary(
      tokens,
      suggestions
    );

    if (Object.keys(validChanges).length > 0) {
      useTokenStateStore.getState().setTokens(validChanges, "stage1");
    }

    return {
      appliedCount: Object.keys(validChanges).length,
      invalidPaths,
      resolvedAt: new Date().toISOString(),
    };
  },
  reset: () => set(INITIAL_STATE),
}));

export const resetStage1BundleStore = () => {
  useStage1BundleStore.setState(INITIAL_STATE);
};
