import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

type FoundryBridgeResponse = {
  ok?: boolean;
  message?: string;
  error?: unknown;
  result?: unknown;
};

type StructuredDataResult = {
  version?: string;
  generatedAt?: string;
  payload?: JsonRecord;
};

type RegistryComponent = {
  id: string;
  displayName: string;
  traitProps: string[];
};

type FragmentEntry = {
  nodeId?: string;
  component?: string;
  html?: string;
  cssRefs?: string[];
};

type RenderResult = {
  status?: string;
  registryVersion?: string;
  errors?: Array<{ code?: string; message?: string }>;
  warnings?: Array<{ code?: string; message?: string }>;
  fragments?: Record<string, FragmentEntry>;
  output?: { format?: string; strict?: boolean };
};

type FidelityLevel = "full-content" | "partial" | "empty-shell" | "error";

type ProbeResult = {
  component: string;
  displayName: string;
  classification: FidelityLevel;
  nodeId: string;
  probeProps: JsonRecord;
  dataPropAttributes: string[];
  rootTag: string | null;
  structureSummary: string;
  html: string;
  warnings: string[];
  errors: string[];
  cssRefs: string[];
  attempts: number;
};

type CardVariantResult = {
  variant: string;
  classification: FidelityLevel;
  html: string;
  dataPropAttributes: string[];
  structureSummary: string;
  errors: string[];
};

const DEFAULT_BASE_URL = "http://127.0.0.1:4466/run";
const OUTPUT_ROOT = path.resolve(
  process.cwd(),
  "cmos",
  "evidence",
  "s17-m01"
);
const RAW_ROOT = path.join(OUTPUT_ROOT, "raw-fragments");
const RAW_HTML_ROOT = path.join(RAW_ROOT, "html");
const CARD_VARIANTS_ROOT = path.join(RAW_ROOT, "card-variants");

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toStringValue(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const dedupe = (values: string[]): string[] =>
  Array.from(new Set(values.filter(Boolean)));

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const endpoint =
  process.env.OODS_FOUNDRY_MCP_URL?.trim() ||
  process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL?.trim() ||
  DEFAULT_BASE_URL;

const resolveRunEndpoint = (value: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid Foundry endpoint: ${value}`);
  }
  const trimmedPath = parsed.pathname.replace(/\/+$/g, "");
  if (!trimmedPath || trimmedPath === "/") {
    parsed.pathname = "/run";
    return parsed.toString();
  }
  if (trimmedPath.endsWith("/run")) {
    parsed.pathname = "/run";
    return parsed.toString();
  }
  throw new Error(
    `Expected a /run endpoint for this audit. Received path: ${parsed.pathname}`
  );
};

const runEndpoint = resolveRunEndpoint(endpoint);

const callBridgeTool = async <T>(
  tool: string,
  input: JsonRecord
): Promise<T> => {
  const response = await fetch(runEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, input }),
  });
  const bodyText = await response.text();
  const parsed = safeJsonParse(bodyText);

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} calling ${tool}: ${
        typeof parsed === "string" ? parsed : JSON.stringify(parsed)
      }`
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(`Unexpected ${tool} response payload shape.`);
  }

  const bridge = parsed as FoundryBridgeResponse;
  if (bridge.ok === false) {
    const message = toStringValue(bridge.message) || "Bridge returned ok=false.";
    throw new Error(`${tool} failed: ${message}`);
  }

  if (isRecord(bridge.error)) {
    const message =
      toStringValue(bridge.error.message) ||
      toStringValue(bridge.error.code) ||
      "Bridge returned error.";
    throw new Error(`${tool} error: ${message}`);
  }

  return bridge.result as T;
};

const extractRegistryComponents = (result: StructuredDataResult): RegistryComponent[] => {
  if (!isRecord(result.payload)) {
    throw new Error("structuredData.fetch returned no payload.");
  }
  const raw = Array.isArray(result.payload.components)
    ? result.payload.components
    : [];
  const components: RegistryComponent[] = [];

  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = toStringValue(entry.id);
    if (!id) continue;
    const displayName = toStringValue(entry.displayName) ?? id;

    const traitProps: string[] = [];
    if (Array.isArray(entry.traitUsages)) {
      for (const usage of entry.traitUsages) {
        if (!isRecord(usage) || !isRecord(usage.props)) continue;
        for (const key of Object.keys(usage.props)) {
          if (key.trim().length > 0) {
            traitProps.push(key.trim());
          }
        }
      }
    }

    components.push({
      id,
      displayName,
      traitProps: dedupe(traitProps).sort((a, b) => a.localeCompare(b)),
    });
  }

  return components.sort((a, b) => a.id.localeCompare(b.id));
};

const sampleValueForProp = (componentId: string, key: string): unknown => {
  const normalized = key.toLowerCase();

  if (
    normalized.startsWith("is_") ||
    normalized.startsWith("has_") ||
    normalized.includes("enabled") ||
    normalized.includes("allow") ||
    normalized.includes("require")
  ) {
    return true;
  }

  if (
    normalized.includes("count") ||
    normalized.includes("total") ||
    normalized.includes("score") ||
    normalized.includes("quantity") ||
    normalized.includes("amount") ||
    normalized.includes("minor") ||
    normalized.includes("hours") ||
    normalized.includes("days") ||
    normalized.includes("percent") ||
    normalized.includes("ratio")
  ) {
    return 42;
  }

  if (
    normalized.includes("latitude") ||
    normalized.endsWith("_lat") ||
    normalized === "lat"
  ) {
    return 37.7749;
  }

  if (
    normalized.includes("longitude") ||
    normalized.endsWith("_lng") ||
    normalized.endsWith("_lon") ||
    normalized === "lng" ||
    normalized === "lon"
  ) {
    return -122.4194;
  }

  if (normalized.includes("date") || normalized.endsWith("_at")) {
    return "2026-02-27T00:00:00Z";
  }

  if (normalized.includes("currency")) {
    return "USD";
  }

  if (normalized.includes("timezone")) {
    return "UTC";
  }

  if (normalized.includes("status")) {
    return "active";
  }

  if (normalized.includes("intent")) {
    return "info";
  }

  if (normalized.includes("mode")) {
    return "default";
  }

  if (
    normalized.includes("roles") ||
    normalized.includes("states") ||
    normalized.includes("events") ||
    normalized.includes("tags") ||
    normalized.includes("fields") ||
    normalized.includes("channels") ||
    normalized.includes("reasons")
  ) {
    return ["one", "two"];
  }

  if (normalized.includes("options")) {
    return ["alpha", "beta"];
  }

  if (normalized.endsWith("_id") || normalized === "id") {
    return `${slugify(componentId)}-001`;
  }

  if (normalized.includes("color")) {
    return "primary";
  }

  return `${componentId} ${key}`.slice(0, 80);
};

const buildComponentSpecificProps = (componentId: string): JsonRecord => {
  if (componentId === "Button") {
    return { label: "Primary action" };
  }
  if (componentId === "Badge") {
    return { label: "Active", intent: "info" };
  }
  if (componentId === "Banner") {
    return {
      title: "Workbench Overview",
      message: "Track pipeline health and delivery metrics.",
      intent: "info",
    };
  }
  if (componentId === "Card") {
    return {
      title: "Active users",
      value: "1,240",
      trend: "+12%",
    };
  }
  if (componentId === "Input") {
    return {
      label: "Search",
      placeholder: "Search metrics",
      value: "Q1",
    };
  }
  if (componentId === "Select") {
    return {
      label: "Period",
      options: [
        { label: "Weekly", value: "weekly" },
        { label: "Monthly", value: "monthly" },
      ],
      value: "weekly",
    };
  }
  if (componentId === "Table") {
    return {
      headers: ["Metric", "Value", "Delta"],
      rows: [
        ["Users", "1,240", "+12%"],
        ["Revenue", "$42k", "+8%"],
        ["Conversion", "3.8%", "+0.4%"],
      ],
    };
  }
  if (componentId === "Tabs") {
    return {
      tabs: [
        { id: "overview", label: "Overview" },
        { id: "pipeline", label: "Pipeline" },
        { id: "team", label: "Team" },
      ],
      activeTab: "overview",
    };
  }
  if (componentId === "Text") {
    return { text: "Fragment fidelity probe text." };
  }
  if (componentId === "Stack") {
    return { direction: "column", gap: 16 };
  }
  if (componentId === "Grid") {
    return { columns: 3, gap: 16 };
  }
  return {};
};

const buildProbeProps = (component: RegistryComponent): JsonRecord => {
  const props: JsonRecord = { ...buildComponentSpecificProps(component.id) };
  for (const key of component.traitProps) {
    if (!(key in props)) {
      props[key] = sampleValueForProp(component.id, key);
    }
  }

  if (Object.keys(props).length === 0) {
    props.label = `${component.id} Probe`;
  }
  return props;
};

const extractInnerHtml = (html: string): string => {
  const trimmed = html.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^<([a-zA-Z0-9:-]+)(\s[^>]*)?>([\s\S]*)<\/\1>\s*$/);
  if (!match) return trimmed;
  return match[3]?.trim() ?? "";
};

const extractDataPropAttributes = (html: string): string[] => {
  const attrs = new Set<string>();
  const attrRegex = /\s(data-prop-[a-zA-Z0-9-_:.]+)=/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(html)) !== null) {
    attrs.add(match[1]);
  }
  return Array.from(attrs).sort((a, b) => a.localeCompare(b));
};

const extractRootTag = (html: string): string | null => {
  const match = html.trim().match(/^<([a-zA-Z0-9:-]+)/);
  return match?.[1] ?? null;
};

const summarizeStructure = (html: string): string => {
  const rootTag = extractRootTag(html) ?? "unknown";
  const inner = extractInnerHtml(html);
  if (!inner) {
    return `${rootTag} (no inner HTML)`;
  }
  const tagRegex = /<([a-zA-Z0-9:-]+)/g;
  const tags = new Set<string>();
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRegex.exec(inner)) !== null) {
    tags.add(tagMatch[1]);
  }
  const text = inner
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const childTags = Array.from(tags).slice(0, 6).join(", ") || "none";
  const textSnippet = text ? `text: "${text.slice(0, 60)}"` : "text: none";
  return `${rootTag} -> children: ${childTags}; ${textSnippet}`;
};

const classifyFragment = (html: string, dataPropAttributes: string[]): FidelityLevel => {
  const inner = extractInnerHtml(html);
  if (!html.trim()) return "error";
  if (!inner) return "empty-shell";
  if (dataPropAttributes.length > 0) return "partial";
  return "full-content";
};

const renderComponentProbe = async (
  component: RegistryComponent,
  maxAttempts = 3
): Promise<ProbeResult> => {
  const slug = slugify(component.id);
  const nodeId = `probe-${slug}`;
  const props = buildProbeProps(component);
  const input = {
    mode: "full",
    apply: true,
    output: {
      format: "fragments",
      strict: false,
      includeCss: true,
    },
    schema: {
      version: "2025.11",
      screens: [
        {
          id: `audit-screen-${slug}`,
          component: "Stack",
          children: [
            {
              id: nodeId,
              component: component.id,
              props,
            },
          ],
        },
      ],
    },
  } as const;

  let attempt = 0;
  let lastError: Error | null = null;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const result = await callBridgeTool<RenderResult>("repl", { action: "render", ...input });
      const fragments =
        isRecord(result.fragments) ? (result.fragments as Record<string, FragmentEntry>) : {};
      const fragment = fragments[nodeId] ?? Object.values(fragments)[0];
      const html = toStringValue(fragment?.html) ?? "";
      const dataPropAttributes = extractDataPropAttributes(html);
      const classification =
        fragment && html
          ? classifyFragment(html, dataPropAttributes)
          : (result.errors?.length ?? 0) > 0
            ? "error"
            : "error";
      const errors = (result.errors ?? []).map(
        (entry) => `${entry.code ?? "ERROR"}: ${entry.message ?? "Unknown error"}`
      );
      const warnings = (result.warnings ?? []).map(
        (entry) => `${entry.code ?? "WARN"}: ${entry.message ?? "Unknown warning"}`
      );

      return {
        component: component.id,
        displayName: component.displayName,
        classification,
        nodeId,
        probeProps: props,
        dataPropAttributes,
        rootTag: extractRootTag(html),
        structureSummary: summarizeStructure(html),
        html,
        warnings,
        errors,
        cssRefs: Array.isArray(fragment?.cssRefs) ? toStringArray(fragment.cssRefs) : [],
        attempts: attempt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(toMessage(error));
      const message = lastError.message.toLowerCase();
      const mayRetry =
        message.includes("429") ||
        message.includes("rate limit") ||
        message.includes("too many requests");
      if (mayRetry && attempt < maxAttempts) {
        await sleep(65_000);
        continue;
      }
      break;
    }
  }

  return {
    component: component.id,
    displayName: component.displayName,
    classification: "error",
    nodeId,
    probeProps: props,
    dataPropAttributes: [],
    rootTag: null,
    structureSummary: "error (render call failed)",
    html: "",
    warnings: [],
    errors: [lastError ? lastError.message : "Unknown render failure"],
    cssRefs: [],
    attempts: attempt,
  };
};

const runCardVariant = async (
  variant: string,
  props: JsonRecord
): Promise<CardVariantResult> => {
  const nodeId = `probe-card-${slugify(variant)}`;
  const input = {
    mode: "full",
    apply: true,
    output: {
      format: "fragments",
      strict: false,
      includeCss: true,
    },
    schema: {
      version: "2025.11",
      screens: [
        {
          id: "audit-screen-card-variants",
          component: "Stack",
          children: [
            {
              id: nodeId,
              component: "Card",
              props,
            },
          ],
        },
      ],
    },
  } as const;

  try {
    const result = await callBridgeTool<RenderResult>("repl", { action: "render", ...input });
    const fragments =
      isRecord(result.fragments) ? (result.fragments as Record<string, FragmentEntry>) : {};
    const fragment = fragments[nodeId] ?? Object.values(fragments)[0];
    const html = toStringValue(fragment?.html) ?? "";
    const dataPropAttributes = extractDataPropAttributes(html);
    const classification =
      fragment && html
        ? classifyFragment(html, dataPropAttributes)
        : (result.errors?.length ?? 0) > 0
          ? "error"
          : "error";
    const errors = (result.errors ?? []).map(
      (entry) => `${entry.code ?? "ERROR"}: ${entry.message ?? "Unknown error"}`
    );

    return {
      variant,
      classification,
      html,
      dataPropAttributes,
      structureSummary: summarizeStructure(html),
      errors,
    };
  } catch (error) {
    return {
      variant,
      classification: "error",
      html: "",
      dataPropAttributes: [],
      structureSummary: "error (render call failed)",
      errors: [toMessage(error)],
    };
  }
};

const writeProbeArtifacts = async (result: ProbeResult): Promise<void> => {
  const baseName = slugify(result.component);
  const jsonPath = path.join(RAW_ROOT, `${baseName}.json`);
  const htmlPath = path.join(RAW_HTML_ROOT, `${baseName}.html`);

  const payload = {
    component: result.component,
    displayName: result.displayName,
    classification: result.classification,
    nodeId: result.nodeId,
    attempts: result.attempts,
    probeProps: result.probeProps,
    rootTag: result.rootTag,
    structureSummary: result.structureSummary,
    dataPropAttributes: result.dataPropAttributes,
    cssRefs: result.cssRefs,
    warnings: result.warnings,
    errors: result.errors,
    html: result.html,
  };

  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(htmlPath, `${result.html}\n`, "utf8");
};

const writeCardVariantArtifacts = async (
  variant: CardVariantResult
): Promise<void> => {
  const fileBase = `card-${slugify(variant.variant)}`;
  await writeFile(
    path.join(CARD_VARIANTS_ROOT, `${fileBase}.json`),
    `${JSON.stringify(variant, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(CARD_VARIANTS_ROOT, `${fileBase}.html`),
    `${variant.html}\n`,
    "utf8"
  );
};

const buildReport = (options: {
  generatedAt: string;
  registryVersion: string;
  registryGeneratedAt: string | null;
  componentCount: number;
  results: ProbeResult[];
  cardVariants: CardVariantResult[];
}): string => {
  const summary = {
    full: options.results.filter((result) => result.classification === "full-content")
      .length,
    partial: options.results.filter((result) => result.classification === "partial")
      .length,
    empty: options.results.filter((result) => result.classification === "empty-shell")
      .length,
    error: options.results.filter((result) => result.classification === "error")
      .length,
  };

  const lines: string[] = [];
  lines.push("# Fragment Fidelity Audit");
  lines.push("");
  lines.push(`- Generated: ${options.generatedAt}`);
  lines.push(`- Foundry endpoint: ${runEndpoint}`);
  lines.push(`- Registry version: ${options.registryVersion}`);
  lines.push(
    `- Structured data generatedAt: ${options.registryGeneratedAt ?? "unknown"}`
  );
  lines.push(`- Components audited: ${options.componentCount}`);
  lines.push(`- Classification totals:`);
  lines.push(`  - full-content: ${summary.full}`);
  lines.push(`  - partial: ${summary.partial}`);
  lines.push(`  - empty-shell: ${summary.empty}`);
  lines.push(`  - error: ${summary.error}`);
  lines.push("");
  lines.push("## Fidelity Table");
  lines.push("");
  lines.push("| Component | Classification | Root | data-prop-* attrs | Structure / Notes |");
  lines.push("| --- | --- | --- | --- | --- |");

  for (const result of options.results) {
    const attrs =
      result.dataPropAttributes.length > 0
        ? result.dataPropAttributes.join(", ")
        : "none";
    const notes =
      result.classification === "error"
        ? (result.errors[0] ?? "render failed").replace(/\|/g, "\\|")
        : result.structureSummary.replace(/\|/g, "\\|");
    lines.push(
      `| ${result.component} | ${result.classification} | ${
        result.rootTag ?? "n/a"
      } | ${attrs} | ${notes} |`
    );
  }

  lines.push("");
  lines.push("## Empty-Shell Components");
  lines.push("");
  const empties = options.results.filter(
    (result) => result.classification === "empty-shell"
  );
  if (empties.length === 0) {
    lines.push("- None");
  } else {
    for (const result of empties) {
      const attrs =
        result.dataPropAttributes.length > 0
          ? result.dataPropAttributes.join(", ")
          : "none";
      lines.push(`- ${result.component}: data attrs -> ${attrs}`);
    }
  }

  lines.push("");
  lines.push("## Full-Content Components");
  lines.push("");
  const fulls = options.results.filter(
    (result) => result.classification === "full-content"
  );
  if (fulls.length === 0) {
    lines.push("- None");
  } else {
    for (const result of fulls) {
      lines.push(`- ${result.component}: ${result.structureSummary}`);
    }
  }

  lines.push("");
  lines.push("## Partial Components");
  lines.push("");
  const partials = options.results.filter(
    (result) => result.classification === "partial"
  );
  if (partials.length === 0) {
    lines.push("- None");
  } else {
    for (const result of partials) {
      lines.push(
        `- ${result.component}: attrs=${result.dataPropAttributes.join(", ")}; ${result.structureSummary}`
      );
    }
  }

  lines.push("");
  lines.push("## Error Components");
  lines.push("");
  const errors = options.results.filter(
    (result) => result.classification === "error"
  );
  if (errors.length === 0) {
    lines.push("- None");
  } else {
    for (const result of errors) {
      lines.push(`- ${result.component}: ${result.errors.join(" | ")}`);
    }
  }

  lines.push("");
  lines.push("## Card Variant Probes");
  lines.push("");
  lines.push("| Variant | Classification | data-prop-* attrs | Structure / Errors |");
  lines.push("| --- | --- | --- | --- |");
  for (const variant of options.cardVariants) {
    const attrs =
      variant.dataPropAttributes.length > 0
        ? variant.dataPropAttributes.join(", ")
        : "none";
    const note =
      variant.errors.length > 0
        ? variant.errors.join(" | ").replace(/\|/g, "\\|")
        : variant.structureSummary.replace(/\|/g, "\\|");
    lines.push(`| ${variant.variant} | ${variant.classification} | ${attrs} | ${note} |`);
  }

  lines.push("");
  lines.push("## Evidence Paths");
  lines.push("");
  lines.push("- Raw per-component JSON: `cmos/evidence/s17-m01/raw-fragments/*.json`");
  lines.push("- Raw per-component fragment HTML: `cmos/evidence/s17-m01/raw-fragments/html/*.html`");
  lines.push("- Card variants: `cmos/evidence/s17-m01/raw-fragments/card-variants/*`");

  return `${lines.join("\n")}\n`;
};

const run = async () => {
  await mkdir(RAW_HTML_ROOT, { recursive: true });
  await mkdir(CARD_VARIANTS_ROOT, { recursive: true });

  const structured = await callBridgeTool<StructuredDataResult>(
    "structuredData.fetch",
    { dataset: "components" }
  );
  const components = extractRegistryComponents(structured);
  if (components.length === 0) {
    throw new Error("No components returned by structuredData.fetch.");
  }

  const results: ProbeResult[] = [];
  for (const component of components) {
    const result = await renderComponentProbe(component);
    results.push(result);
    await writeProbeArtifacts(result);
    await sleep(120);
  }

  const cardVariants: CardVariantResult[] = [];
  const probes: Array<{ variant: string; props: JsonRecord }> = [
    {
      variant: "title-only",
      props: { title: "Active users" },
    },
    {
      variant: "title-value",
      props: { title: "Active users", value: "1,240" },
    },
    {
      variant: "title-value-trend",
      props: { title: "Active users", value: "1,240", trend: "+12%" },
    },
  ];

  for (const probe of probes) {
    const outcome = await runCardVariant(probe.variant, probe.props);
    cardVariants.push(outcome);
    await writeCardVariantArtifacts(outcome);
  }

  const report = buildReport({
    generatedAt: new Date().toISOString(),
    registryVersion: structured.version ?? "unknown",
    registryGeneratedAt: structured.generatedAt ?? null,
    componentCount: components.length,
    results,
    cardVariants,
  });
  const reportPath = path.join(OUTPUT_ROOT, "fragment-fidelity-audit.md");
  await writeFile(reportPath, report, "utf8");

  const summary = {
    componentCount: components.length,
    fullContent: results.filter((result) => result.classification === "full-content")
      .length,
    partial: results.filter((result) => result.classification === "partial").length,
    emptyShell: results.filter((result) => result.classification === "empty-shell")
      .length,
    error: results.filter((result) => result.classification === "error").length,
  };

  process.stdout.write(`${JSON.stringify({ reportPath, ...summary }, null, 2)}\n`);
};

run().catch((error) => {
  process.stderr.write(`Fragment fidelity audit failed: ${toMessage(error)}\n`);
  process.exit(1);
});
