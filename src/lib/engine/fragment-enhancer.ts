type FragmentEnhancer = (props: Record<string, unknown>) => string;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const toDisplayValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toDisplayValue(entry)).filter(Boolean).join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return "";
  }
  return "";
};

const firstProp = (
  props: Record<string, unknown>,
  keys: string[],
  fallback: string,
): string => {
  for (const key of keys) {
    const value = toDisplayValue(props[key]);
    if (value) {
      return value;
    }
  }
  return fallback;
};

const normalizeComponentType = (componentType: string): string =>
  componentType.replace(/^oods:/i, "").trim();

const parseElementShell = (
  html: string,
): { tagName: string; attrs: string; innerHtml: string } | null => {
  const trimmed = html.trim();
  const match = trimmed.match(/^<([a-zA-Z0-9:-]+)([^>]*)>([\s\S]*)<\/\1>\s*$/);
  if (!match) {
    return null;
  }
  return {
    tagName: match[1],
    attrs: match[2] ?? "",
    innerHtml: match[3] ?? "",
  };
};

const isEmptyElementHtml = (innerHtml: string): boolean =>
  innerHtml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/&nbsp;/g, "")
    .trim().length === 0;

const injectInnerHtml = (html: string, content: string): string => {
  const shell = parseElementShell(html);
  if (!shell) {
    return html;
  }
  return `<${shell.tagName}${shell.attrs}>${content}</${shell.tagName}>`;
};

const baseTitleStyle = [
  "font-size:var(--ref-typography-sizes-sm,14px)",
  "line-height:var(--ref-typography-line-height-standard,140%)",
  "font-weight:var(--ref-typography-weights-medium,500)",
  "color:var(--ref-color-neutral-700,#334155)",
].join(";");

const baseValueStyle = [
  "font-size:var(--ref-typography-sizes-xl,24px)",
  "line-height:var(--ref-typography-line-height-tight,120%)",
  "font-weight:var(--ref-typography-weights-semibold,600)",
  "color:var(--ref-color-neutral-900,#0f172a)",
].join(";");

const baseBodyStyle = [
  "font-size:var(--ref-typography-sizes-md,16px)",
  "line-height:var(--ref-typography-line-height-standard,140%)",
  "font-weight:var(--ref-typography-weights-regular,400)",
  "color:var(--ref-color-neutral-800,#1f2937)",
].join(";");

const renderCardEnhancement: FragmentEnhancer = (props) => {
  const title = firstProp(props, ["title", "label", "heading"], "Card");
  const value = firstProp(props, ["value", "text", "content"], "—");
  const trend = firstProp(props, ["trend", "delta", "meta"], "");
  const trendMarkup = trend
    ? `<div style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;border:1px solid var(--ref-color-info-300,#93c5fd);background:var(--ref-color-info-100,#dbeafe);font-size:var(--ref-typography-sizes-xs,12px);color:var(--ref-color-info-900,#1e3a8a);">${escapeHtml(
        trend,
      )}</div>`
    : "";

  return `<div data-fragment-enhanced="true" data-enhancer="Card" style="display:flex;flex-direction:column;gap:var(--ref-space-stack-compact,12px);">
    <div style="${baseTitleStyle}">${escapeHtml(title)}</div>
    <div style="${baseValueStyle}">${escapeHtml(value)}</div>
    ${trendMarkup}
  </div>`;
};

const renderInlineLabelEnhancement: FragmentEnhancer = (props) => {
  const label = firstProp(props, ["label", "text", "value", "field"], "Label");
  return `<span data-fragment-enhanced="true" data-enhancer="InlineLabel" style="${baseTitleStyle};display:inline-block;">${escapeHtml(
    label,
  )}</span>`;
};

const renderRelativeTimestampEnhancement: FragmentEnhancer = (props) => {
  const value = firstProp(
    props,
    ["text", "value", "timestamp", "field", "fallback"],
    "Recently updated",
  );
  return `<span data-fragment-enhanced="true" data-enhancer="RelativeTimestamp" style="${baseBodyStyle}">${escapeHtml(
    value,
  )}</span>`;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => toDisplayValue(entry))
    .filter((entry): entry is string => entry.length > 0);
};

const renderTagPillsEnhancement: FragmentEnhancer = (props) => {
  const tags = toStringArray(props.tags ?? props.items ?? props.value);
  const visibleTags = tags.length > 0 ? tags.slice(0, 4) : ["Tag"];
  const pills = visibleTags
    .map(
      (tag) =>
        `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;border:1px solid var(--ref-color-neutral-300,#cbd5e1);background:var(--ref-color-neutral-100,#f1f5f9);font-size:var(--ref-typography-sizes-xs,12px);color:var(--ref-color-neutral-800,#1f2937);">${escapeHtml(
          tag,
        )}</span>`,
    )
    .join("");

  return `<div data-fragment-enhanced="true" data-enhancer="TagPills" style="display:flex;flex-wrap:wrap;gap:var(--ref-space-inline-xs,8px);">${pills}</div>`;
};

const renderStackEnhancement: FragmentEnhancer = (props) => {
  const items = toStringArray(props.items ?? props.children ?? props.values);
  const visibleItems = items.length > 0 ? items.slice(0, 3) : ["Item 1", "Item 2"];
  const direction = firstProp(props, ["direction", "orientation"], "column")
    .toLowerCase()
    .includes("row")
    ? "row"
    : "column";
  const itemMarkup = visibleItems
    .map(
      (item) =>
        `<div style="padding:6px 10px;border-radius:8px;background:var(--ref-color-neutral-100,#f1f5f9);border:1px solid var(--ref-color-neutral-200,#e2e8f0);font-size:var(--ref-typography-sizes-sm,14px);color:var(--ref-color-neutral-800,#1f2937);">${escapeHtml(
          item,
        )}</div>`,
    )
    .join("");
  return `<div data-fragment-enhanced="true" data-enhancer="Stack" style="display:flex;flex-direction:${direction};gap:var(--ref-space-stack-compact,12px);">${itemMarkup}</div>`;
};

// Props that commonly carry a component's human-readable copy, in priority
// order. The generic fallback surfaces the FIRST non-empty one as text rather
// than dumping every prop as `key: value` rows — that dump reads as a metadata
// listing, not a rendered component (the s20-m09 bug: a heading showed as
// "text / content: … / variant: heading"). Fires only when Forge returned an
// empty shell, typically because the agent used an unknown prop name.
const CONTENT_PROP_KEYS = [
  "text",
  "content",
  "value",
  "label",
  "title",
  "heading",
  "message",
  "body",
  "caption",
  "description",
  "placeholder",
];

// Like firstProp, but ONLY strings and finite numbers count as copy: a boolean
// content prop (e.g. {text:false}) must not render the word "false" — it falls
// through to the unrenderable affordance. (0 is legitimate copy and renders.)
const firstRenderableCopy = (
  props: Record<string, unknown>,
  keys: string[],
): string => {
  for (const key of keys) {
    const raw = props[key];
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return String(raw);
    }
  }
  return "";
};

const renderGenericEnhancement = (
  componentType: string,
  props: Record<string, unknown>,
): string => {
  const content = firstRenderableCopy(props, CONTENT_PROP_KEYS);
  if (content) {
    // Sane minimal render: show the copy the agent supplied.
    return `<div data-fragment-enhanced="true" data-enhancer="Generic" style="${baseBodyStyle}">${escapeHtml(
      content,
    )}</div>`;
  }

  // No human-readable prop to show — an explicit, muted "unrenderable" affordance
  // naming the component, NOT a raw prop dump. The shell keeps its anchor, so the
  // human can still comment on it.
  return `<div data-fragment-enhanced="true" data-enhancer="Generic" style="${baseBodyStyle};color:var(--ref-color-neutral-500,#64748b);font-style:italic;">${escapeHtml(
    componentType || "Component",
  )} — no preview content</div>`;
};

const extractTextContent = (value: string): string =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const enhanceBannerFragment = (
  html: string,
  innerHtml: string,
  props: Record<string, unknown>,
): string => {
  const title = firstProp(props, ["title", "heading", "label"], "");
  if (!title) {
    return html;
  }

  const innerText = extractTextContent(innerHtml).toLowerCase();
  if (innerText.includes(title.toLowerCase())) {
    return html;
  }

  const content = `<div data-fragment-enhanced="true" data-enhancer="Banner" style="display:flex;flex-direction:column;gap:var(--ref-space-stack-compact,12px);">
    <div style="${baseTitleStyle};font-weight:var(--ref-typography-weights-semibold,600);color:var(--ref-color-info-900,#1e3a8a);">${escapeHtml(
      title,
    )}</div>
    <div style="${baseBodyStyle};color:var(--ref-color-info-900,#1e3a8a);">${innerHtml}</div>
  </div>`;

  return injectInnerHtml(html, content);
};

const ENHANCERS: Record<string, FragmentEnhancer> = {
  Card: renderCardEnhancement,
  InlineLabel: renderInlineLabelEnhancement,
  RelativeTimestamp: renderRelativeTimestampEnhancement,
  Stack: renderStackEnhancement,
  TagPills: renderTagPillsEnhancement,
};

export const enhanceFragment = (
  html: string,
  componentType: string,
  props: Record<string, unknown> = {},
): string => {
  const shell = parseElementShell(html);
  if (!shell) {
    return html;
  }
  const normalizedType = normalizeComponentType(componentType);
  if (!isEmptyElementHtml(shell.innerHtml)) {
    if (normalizedType === "Banner") {
      return enhanceBannerFragment(html, shell.innerHtml, props);
    }
    return html;
  }

  const enhancer = ENHANCERS[normalizedType];
  const content = enhancer
    ? enhancer(props)
    : renderGenericEnhancement(normalizedType || "Component", props);

  if (!content.trim()) {
    return html;
  }

  return injectInnerHtml(html, content);
};

export const __internal__ = {
  isEmptyElementHtml,
  parseElementShell,
};
