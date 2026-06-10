import type { FoundryStructuredDataOutput } from "@/lib/mcp/foundry-client";
import { createFoundryMcpClient } from "@/lib/mcp/foundry-client";
import { listBuiltInTemplates } from "@/lib/templates/built-in-library";

export type FoundryCatalogTraitUsage = {
  trait: string;
  context?: string;
  props: string[];
};

export type FoundryCatalogComponent = {
  id: string;
  name: string;
  description?: string;
  categories: string[];
  tags: string[];
  variants: string[];
  traits: string[];
  requiredProps: string[];
  traitUsages: FoundryCatalogTraitUsage[];
};

export type FoundryComponentCatalog = {
  etag: string;
  generatedAt: string | null;
  schemaValidated: boolean;
  componentCount: number;
  components: FoundryCatalogComponent[];
};

export type ComponentCatalogSource = "foundry" | "fallback";

export type ComponentCatalogSnapshot = {
  source: ComponentCatalogSource;
  fromCache: boolean;
  fetchedAt: string;
  catalog: FoundryComponentCatalog;
};

export const COMPONENT_CATALOG_CACHE_TTL_MS = 5 * 60 * 1_000;
export const WORKBENCH_S44_COMPONENTS = [
  "Button",
  "Card",
  "Stack",
  "Text",
  "Input",
  "Select",
  "Badge",
  "Banner",
  "Table",
  "Tabs",
] as const;
const WORKBENCH_S44_COMPONENT_SET = new Set<string>(WORKBENCH_S44_COMPONENTS);

// Forge silently drops props it doesn't recognise and renders the component as
// an EMPTY shell (verified: Text with `text` renders its copy; Text with
// `content`/`variant` renders empty with the props echoed as data-prop-*). The
// catalog's live propSchema is empty for these primitives, so without this hint
// the agent invents prop names and the element renders blank (s20-m09). Keep it
// grounded — only state what's verified against the live renderer.
const PRIMITIVE_PROP_GUIDANCE =
  "Prop contract: a component's visible copy goes in its content prop — Text uses `text` (a string). Props Forge does not recognise are silently dropped and the component renders EMPTY, so never invent props like `content` or `variant`; use the prop names shown above.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toStringValue(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const dedupeAndSort = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b)
  );

const normalizeTraitUsage = (value: unknown): FoundryCatalogTraitUsage | null => {
  if (!isRecord(value)) return null;

  const trait = toStringValue(value.trait);
  if (!trait) return null;

  const context = toStringValue(value.context) ?? undefined;
  const props = isRecord(value.props)
    ? dedupeAndSort(Object.keys(value.props))
    : [];

  return {
    trait,
    context,
    props,
  };
};

const normalizeComponent = (value: unknown): FoundryCatalogComponent | null => {
  if (!isRecord(value)) return null;

  const id = toStringValue(value.id);
  const displayName = toStringValue(value.displayName);
  const name = displayName ?? id;
  const description = toStringValue(value.description) ?? undefined;

  if (!id || !name) return null;

  const traitUsages = Array.isArray(value.traitUsages)
    ? value.traitUsages
        .map((entry) => normalizeTraitUsage(entry))
        .filter((entry): entry is FoundryCatalogTraitUsage => Boolean(entry))
    : [];

  const traits = dedupeAndSort(traitUsages.map((entry) => entry.trait));
  const traitProps = dedupeAndSort(
    traitUsages.flatMap((entry) => entry.props)
  );
  const explicitRequiredProps = toStringArray(value.requiredProps);

  const categories = dedupeAndSort(toStringArray(value.categories));
  const tags = dedupeAndSort(toStringArray(value.tags));
  const variants = dedupeAndSort([
    ...toStringArray(value.contexts),
    ...toStringArray(value.regions),
    ...toStringArray(value.variants),
  ]);

  return {
    id,
    name,
    description,
    categories,
    tags,
    variants,
    traits,
    requiredProps: dedupeAndSort([...explicitRequiredProps, ...traitProps]),
    traitUsages,
  };
};

export const normalizeFoundryComponentCatalog = (
  data: FoundryStructuredDataOutput<Record<string, unknown>>
): FoundryComponentCatalog | null => {
  const payload = data.payload;
  if (!isRecord(payload)) {
    return null;
  }

  const rawComponents = Array.isArray(payload.components)
    ? payload.components
    : [];

  const components = rawComponents
    .map((entry) => normalizeComponent(entry))
    .filter((entry): entry is FoundryCatalogComponent => Boolean(entry))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    etag: data.etag,
    generatedAt: data.generatedAt,
    schemaValidated: data.schemaValidated,
    componentCount: components.length,
    components,
  };
};

export const formatFoundryCatalogForPrompt = (
  catalog: FoundryComponentCatalog,
  options: { limit?: number; workbenchOnly?: boolean } = {}
): string => {
  const promptComponents =
    options.workbenchOnly === true
      ? catalog.components.filter((component) =>
          WORKBENCH_S44_COMPONENT_SET.has(component.name)
        )
      : catalog.components;
  const limit = options.limit ?? 40;
  const visible = promptComponents.slice(0, limit);
  const lines: string[] = [];

  lines.push("# OODS COMPONENT CATALOG (FOUNDRY)");
  lines.push(
    `Source: structuredData.fetch(dataset=\"components\"). Components: ${promptComponents.length}.`
  );
  if (catalog.generatedAt) {
    lines.push(`Generated at: ${catalog.generatedAt}.`);
  }
  if (!catalog.schemaValidated) {
    lines.push(
      "Warning: catalog schema validation failed on the Foundry side. Use with caution."
    );
  }
  lines.push("");
  if (options.workbenchOnly === true) {
    lines.push(
      `Workbench composition constraint: use only these refs -> ${WORKBENCH_S44_COMPONENTS.map((name) => `oods:${name}`).join(", ")}`
    );
    lines.push(PRIMITIVE_PROP_GUIDANCE);
    lines.push("");
  }
  lines.push(
    "Use these components for composition decisions. Each line includes traits, required props, and variants."
  );

  for (const component of visible) {
    const traits = component.traits.length ? component.traits.join(", ") : "none";
    const requiredProps = component.requiredProps.length
      ? component.requiredProps.join(", ")
      : "none";
    const variants = component.variants.length
      ? component.variants.join(", ")
      : "none";

    lines.push(
      `- oods:${component.name} — traits: ${traits}; required props: ${requiredProps}; variants: ${variants}`
    );
  }

  if (promptComponents.length > limit) {
    lines.push(
      `- ... ${promptComponents.length - limit} additional components omitted for brevity.`
    );
  }

  return lines.join("\n");
};

const normalizeComponentRef = (value: string): string =>
  value.replace(/^oods:/i, "").trim();

const inferFallbackTraits = (name: string): string[] => {
  if (name === "Button") return ["Action"];
  if (name === "Card") return ["Container"];
  if (name === "Stack") return ["Layout"];
  if (name === "Text") return ["Typography"];
  if (name === "Input" || name === "Select") return ["Form Input"];
  if (name === "Badge" || name === "Banner") return ["Status Display"];
  if (name === "Table" || name === "Tabs") return ["Data Presentation"];

  const normalized = name.toLowerCase();
  if (normalized.includes("table") || normalized.includes("timeline")) {
    return ["Data Presentation"];
  }
  if (
    normalized.includes("metric") ||
    normalized.includes("badge") ||
    normalized.includes("summary")
  ) {
    return ["KPI Display"];
  }
  if (normalized.includes("heading") || normalized.includes("text")) {
    return ["Typography"];
  }
  if (
    normalized.includes("panel") ||
    normalized.includes("card") ||
    normalized.includes("container")
  ) {
    return ["Container"];
  }
  return [];
};

const inferFallbackRequiredProps = (name: string): string[] => {
  if (name === "Button") return ["label"];
  if (name === "Card") return ["title"];
  if (name === "Stack") return ["gap"];
  if (name === "Text") return ["text"];
  if (name === "Input") return ["label"];
  if (name === "Select") return ["options"];
  if (name === "Badge") return ["label"];
  if (name === "Banner") return ["message"];
  if (name === "Table") return ["columns", "rows"];
  if (name === "Tabs") return ["tabs"];

  const normalized = name.toLowerCase();
  if (normalized.includes("heading")) {
    return ["text"];
  }
  if (normalized.includes("text")) {
    return ["content"];
  }
  if (normalized.includes("table") || normalized.includes("timeline")) {
    return ["columns", "rows"];
  }
  if (
    normalized.includes("metric") ||
    normalized.includes("badge") ||
    normalized.includes("summary")
  ) {
    return ["label", "value"];
  }
  return [];
};

const buildFallbackComponent = (name: string): FoundryCatalogComponent => {
  const requiredProps = inferFallbackRequiredProps(name);
  const traits = inferFallbackTraits(name);

  return {
    id: name,
    name,
    description: "Fallback catalog entry derived from built-in templates.",
    categories: ["fallback"],
    tags: ["offline", "template-derived"],
    variants: [],
    traits,
    requiredProps,
    traitUsages: traits.map((trait) => ({
      trait,
      props: requiredProps,
    })),
  };
};

export const getFallbackComponentCatalog = (): FoundryComponentCatalog => {
  const builtInTemplateComponents = listBuiltInTemplates()
    .flatMap((template) => template.requiredComponents)
    .map((componentRef) => normalizeComponentRef(componentRef));

  const minimumFallbackComponents = [...WORKBENCH_S44_COMPONENTS];

  const componentNames = dedupeAndSort([
    ...minimumFallbackComponents,
    ...builtInTemplateComponents,
  ]);

  return {
    etag: "fallback-catalog",
    generatedAt: new Date().toISOString(),
    schemaValidated: true,
    componentCount: componentNames.length,
    components: componentNames.map((name) => buildFallbackComponent(name)),
  };
};

const formatFallbackCatalogForPrompt = (
  catalog: FoundryComponentCatalog,
  options: { limit?: number; workbenchOnly?: boolean } = {}
): string => {
  const promptComponents =
    options.workbenchOnly === true
      ? catalog.components.filter((component) =>
          WORKBENCH_S44_COMPONENT_SET.has(component.name)
        )
      : catalog.components;
  const limit = options.limit ?? 40;
  const visible = promptComponents.slice(0, limit);
  const lines: string[] = [];

  lines.push("# OODS COMPONENT CATALOG (FALLBACK)");
  lines.push(
    `Source: Workbench fallback catalog (Foundry unavailable). Components: ${promptComponents.length}.`
  );
  lines.push("");
  if (options.workbenchOnly === true) {
    lines.push(
      `Workbench composition constraint: use only these refs -> ${WORKBENCH_S44_COMPONENTS.map((name) => `oods:${name}`).join(", ")}`
    );
    lines.push(PRIMITIVE_PROP_GUIDANCE);
    lines.push("");
  }
  lines.push(
    "Use these entries as a conservative fallback and prefer semantically matching components."
  );

  for (const component of visible) {
    const traits = component.traits.length ? component.traits.join(", ") : "none";
    const requiredProps = component.requiredProps.length
      ? component.requiredProps.join(", ")
      : "none";
    lines.push(
      `- oods:${component.name} — traits: ${traits}; required props: ${requiredProps}`
    );
  }

  if (promptComponents.length > limit) {
    lines.push(
      `- ... ${promptComponents.length - limit} additional fallback components omitted.`
    );
  }

  return lines.join("\n");
};

let componentCatalogCache: {
  expiresAtMs: number;
  snapshot: Omit<ComponentCatalogSnapshot, "fromCache">;
} | null = null;

export const resetComponentCatalogCache = () => {
  componentCatalogCache = null;
};

export const getComponentCatalogSnapshot = async (
  options: {
    ttlMs?: number;
    nowMs?: number;
    forceRefresh?: boolean;
  } = {}
): Promise<ComponentCatalogSnapshot> => {
  const ttlMs = options.ttlMs ?? COMPONENT_CATALOG_CACHE_TTL_MS;
  const nowMs = options.nowMs ?? Date.now();

  if (
    !options.forceRefresh &&
    componentCatalogCache &&
    componentCatalogCache.expiresAtMs > nowMs
  ) {
    return {
      ...componentCatalogCache.snapshot,
      fromCache: true,
    };
  }

  let source: ComponentCatalogSource = "fallback";
  let catalog = getFallbackComponentCatalog();
  const fetchedAt = new Date(nowMs).toISOString();

  try {
    const response = await createFoundryMcpClient().fetchStructuredData<
      Record<string, unknown>
    >("components");
    const normalized = normalizeFoundryComponentCatalog(response);
    if (normalized && normalized.componentCount > 0) {
      source = "foundry";
      catalog = normalized;
    }
  } catch {
    source = "fallback";
  }

  componentCatalogCache = {
    expiresAtMs: nowMs + ttlMs,
    snapshot: {
      source,
      fetchedAt,
      catalog,
    },
  };

  return {
    source,
    fetchedAt,
    catalog,
    fromCache: false,
  };
};

export const getComponentCatalogPromptSection = async (
  options: {
    limit?: number;
    ttlMs?: number;
    nowMs?: number;
    forceRefresh?: boolean;
  } = {}
): Promise<{
  prompt: string;
  snapshot: ComponentCatalogSnapshot;
}> => {
  const snapshot = await getComponentCatalogSnapshot(options);
  const prompt =
    snapshot.source === "foundry"
      ? formatFoundryCatalogForPrompt(snapshot.catalog, {
          limit: options.limit,
          workbenchOnly: true,
        })
      : formatFallbackCatalogForPrompt(snapshot.catalog, {
          limit: options.limit,
          workbenchOnly: true,
        });

  return {
    prompt,
    snapshot,
  };
};
