import type { ComponentNode, DesignDocument, DesignNode, LayoutNode } from "@/types/document-model";
import { isComponentNode, isLayoutNode } from "@/types/document-model";
import {
  resolveBindings as resolveBindingsShared,
  SHOW_BINDING_EXPRESSION,
} from "@/lib/engine/data-binding";

type StaticRendererOptions = {
  dataContext?: Record<string, unknown>;
};

type ToneKey = "info" | "success" | "warning" | "error" | "neutral";

type ToneStyle = {
  bg: string;
  border: string;
  text: string;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const normalizeRefName = (ref: string): string =>
  ref.replace(/^oods:/i, "").trim();

const toCssSize = (value: number | string | undefined, fallback: string): string => {
  if (typeof value === "number") {
    return `${value}px`;
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
};

const toDisplayValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toDisplayValue(entry)).join(", ");
  }
  return "";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const firstProp = (
  props: Record<string, unknown>,
  keys: string[],
  fallback: string
) => {
  for (const key of keys) {
    const value = props[key];
    const display = toDisplayValue(value).trim();
    if (display) {
      return display;
    }
  }
  return fallback;
};

const toBoolean = (value: unknown): boolean => value === true;

const normalizeTone = (value: unknown): ToneKey => {
  const raw = toDisplayValue(value).toLowerCase();
  if (raw === "success") return "success";
  if (raw === "warning") return "warning";
  if (raw === "error" || raw === "critical" || raw === "danger") return "error";
  if (raw === "info") return "info";
  return "neutral";
};

const TONES: Record<ToneKey, ToneStyle> = {
  info: { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
  success: { bg: "#dcfce7", border: "#86efac", text: "#166534" },
  warning: { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
  error: { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b" },
  neutral: { bg: "#e2e8f0", border: "#cbd5e1", text: "#334155" },
};

const SURFACE = {
  pageBg: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
  shellBg: "#ffffff",
  shellBorder: "#dbe3ee",
  textPrimary: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
  cardBg: "#ffffff",
  cardBorder: "#dbe3ee",
  accent: "#2563eb",
  accentDark: "#1d4ed8",
} as const;

const baseComponentStyle =
  "border:1px solid #dbe3ee;border-radius:14px;background:#ffffff;padding:14px;box-shadow:0 1px 2px rgba(15,23,42,0.05);";

const renderButton = (props: Record<string, unknown>) => {
  const label = firstProp(props, ["label", "text", "title", "content"], "Action");
  const rawVariant = firstProp(props, ["variant", "kind", "appearance"], "primary").toLowerCase();
  const variant = rawVariant === "secondary" || rawVariant === "outline" || rawVariant === "ghost"
    ? "secondary"
    : "primary";

  const style =
    variant === "secondary"
      ? "display:inline-flex;align-items:center;justify-content:center;border:1px solid #94a3b8;border-radius:10px;background:#f8fafc;color:#1e293b;padding:9px 14px;font-size:13px;font-weight:600;"
      : "display:inline-flex;align-items:center;justify-content:center;border:1px solid #1d4ed8;border-radius:10px;background:#2563eb;color:#ffffff;padding:9px 14px;font-size:13px;font-weight:600;";

  return `<div data-static-component="button" data-static-variant="${variant}" style="${baseComponentStyle}">
    <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${SURFACE.textMuted};">Button</div>
    <div style="margin-top:10px;"><button type="button" disabled aria-disabled="true" style="${style}">${escapeHtml(label)}</button></div>
  </div>`;
};

const renderCard = (props: Record<string, unknown>) => {
  const title = firstProp(props, ["title", "heading", "label", "name"], "Card title");
  const body = firstProp(
    props,
    ["body", "content", "description", "text", "value"],
    "Card body content"
  );
  const meta = toDisplayValue(props.trend ?? props.meta ?? "").trim();

  return `<article data-static-component="card" style="${baseComponentStyle}">
    <div data-static-card-title="true" style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${SURFACE.textMuted};">${escapeHtml(title)}</div>
    <div data-static-card-body="true" style="margin-top:8px;font-size:15px;line-height:1.5;color:${SURFACE.textSecondary};">${escapeHtml(body)}</div>
    ${
      meta
        ? `<div style="margin-top:10px;display:inline-flex;border-radius:999px;border:1px solid #bfdbfe;background:#eff6ff;padding:2px 8px;font-size:11px;color:#1d4ed8;">${escapeHtml(meta)}</div>`
        : ""
    }
  </article>`;
};

const renderText = (props: Record<string, unknown>) => {
  const text = firstProp(props, ["text", "content", "value", "description"], "Text block");
  const tag = firstProp(props, ["as", "tag"], "p").toLowerCase();

  if (tag === "h1") {
    return `<div data-static-component="text" style="${baseComponentStyle}"><div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${SURFACE.textMuted};">Text</div><h1 style="margin:8px 0 0;font-size:28px;line-height:1.25;color:${SURFACE.textPrimary};">${escapeHtml(text)}</h1></div>`;
  }

  if (tag === "h2" || tag === "h3") {
    return `<div data-static-component="text" style="${baseComponentStyle}"><div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${SURFACE.textMuted};">Text</div><h2 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:${SURFACE.textPrimary};">${escapeHtml(text)}</h2></div>`;
  }

  return `<div data-static-component="text" style="${baseComponentStyle}">
    <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${SURFACE.textMuted};">Text</div>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.55;color:${SURFACE.textSecondary};">${escapeHtml(text)}</p>
  </div>`;
};

const renderInput = (props: Record<string, unknown>) => {
  const label = firstProp(props, ["label", "title", "name"], "Input");
  const placeholder = firstProp(props, ["placeholder", "hint", "example"], "Enter value");
  const type = firstProp(props, ["type"], "text");
  const required = toBoolean(props.required);

  return `<div data-static-component="input" style="${baseComponentStyle}">
    <label style="display:block;font-size:12px;font-weight:600;color:${SURFACE.textSecondary};">${escapeHtml(label)}${required ? " *" : ""}</label>
    <input type="${escapeHtml(type)}" placeholder="${escapeHtml(placeholder)}" disabled aria-disabled="true" style="margin-top:8px;width:100%;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;color:#94a3b8;padding:9px 11px;font-size:13px;" />
  </div>`;
};

const normalizeOption = (value: unknown, index: number) => {
  if (isRecord(value)) {
    const optionValue = firstProp(value, ["value", "id", "key"], `option-${index + 1}`);
    const label = firstProp(value, ["label", "text", "name", "value"], optionValue);
    return { value: optionValue, label };
  }

  const display = toDisplayValue(value).trim();
  if (display) {
    return { value: display, label: display };
  }

  return { value: `option-${index + 1}`, label: `Option ${index + 1}` };
};

const renderSelect = (props: Record<string, unknown>) => {
  const label = firstProp(props, ["label", "title", "name"], "Select");
  const optionsSource = Array.isArray(props.options) ? props.options : [];
  const options =
    optionsSource.length > 0
      ? optionsSource.map((option, index) => normalizeOption(option, index))
      : [
          { value: "starter", label: "Starter" },
          { value: "team", label: "Team" },
          { value: "enterprise", label: "Enterprise" },
        ];

  const selected = firstProp(props, ["value", "defaultValue"], options[0]?.value ?? "");

  const optionsMarkup = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}" ${option.value === selected ? "selected" : ""}>${escapeHtml(option.label)}</option>`
    )
    .join("");

  return `<div data-static-component="select" style="${baseComponentStyle}">
    <label style="display:block;font-size:12px;font-weight:600;color:${SURFACE.textSecondary};">${escapeHtml(label)}</label>
    <select disabled aria-disabled="true" style="margin-top:8px;width:100%;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;color:#475569;padding:9px 11px;font-size:13px;">${optionsMarkup}</select>
  </div>`;
};

const renderBadge = (props: Record<string, unknown>) => {
  const label = firstProp(props, ["label", "text", "title", "content"], "Badge");
  const tone = normalizeTone(props.tone ?? props.intent ?? "neutral");
  const colors = TONES[tone];

  return `<div data-static-component="badge" style="${baseComponentStyle}">
    <span data-static-tone="${tone}" style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;border:1px solid ${colors.border};background:${colors.bg};padding:4px 10px;font-size:12px;font-weight:600;color:${colors.text};">${escapeHtml(label)}</span>
  </div>`;
};

const renderBanner = (props: Record<string, unknown>) => {
  const title = firstProp(props, ["title", "heading", "label"], "Banner");
  const message = firstProp(
    props,
    ["message", "body", "content", "text", "description"],
    "Contextual information"
  );
  const tone = normalizeTone(props.intent ?? props.tone ?? "info");
  const colors = TONES[tone];

  return `<section data-static-component="banner" data-static-intent="${tone}" style="border-radius:12px;border:1px solid ${colors.border};background:${colors.bg};padding:12px 14px;width:100%;">
    <div style="font-size:12px;font-weight:700;color:${colors.text};">${escapeHtml(title)}</div>
    <div style="margin-top:4px;font-size:13px;line-height:1.45;color:${colors.text};opacity:0.9;">${escapeHtml(message)}</div>
  </section>`;
};

type TableColumn = {
  key: string;
  label: string;
};

const normalizeColumns = (
  props: Record<string, unknown>,
  rows: Array<Record<string, unknown>>
): TableColumn[] => {
  const source = props.columns;
  if (Array.isArray(source) && source.length > 0) {
    return source.map((column, index) => {
      if (isRecord(column)) {
        const key = firstProp(column, ["key", "id", "name", "label"], `column_${index + 1}`);
        const label = firstProp(column, ["label", "title", "name", "key"], key);
        return { key, label };
      }

      const display = toDisplayValue(column).trim();
      if (display) {
        return { key: display, label: display };
      }

      return { key: `column_${index + 1}`, label: `Column ${index + 1}` };
    });
  }

  const firstRow = rows[0];
  if (firstRow) {
    return Object.keys(firstRow).map((key) => ({
      key,
      label: key
        .replaceAll(/[_-]/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase()),
    }));
  }

  return [
    { key: "column_1", label: "Column 1" },
    { key: "column_2", label: "Column 2" },
  ];
};

const normalizeRows = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((row, index) => {
    if (isRecord(row)) {
      return row;
    }

    const display = toDisplayValue(row).trim();
    return { value: display || `Row ${index + 1}` };
  });
};

const renderTable = (props: Record<string, unknown>) => {
  const rows = normalizeRows(props.rows);
  const columns = normalizeColumns(props, rows);

  const resolvedRows =
    rows.length > 0
      ? rows
      : [
          Object.fromEntries(columns.map((column, index) => [column.key, `Value ${index + 1}`])),
          Object.fromEntries(columns.map((column, index) => [column.key, `Value ${index + 3}`])),
        ];

  const headMarkup = columns
    .map(
      (column) =>
        `<th style="border-bottom:1px solid #cbd5e1;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:${SURFACE.textMuted};">${escapeHtml(column.label)}</th>`
    )
    .join("");

  const rowMarkup = resolvedRows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const value = toDisplayValue(row[column.key]).trim() || "-";
          return `<td style="border-bottom:1px solid #e2e8f0;padding:8px 10px;font-size:13px;color:${SURFACE.textSecondary};">${escapeHtml(value)}</td>`;
        })
        .join("");

      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<div data-static-component="table" style="${baseComponentStyle}">
    <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${SURFACE.textMuted};">Table</div>
    <div style="margin-top:8px;overflow:hidden;border:1px solid #dbe3ee;border-radius:10px;">
      <table style="width:100%;border-collapse:collapse;background:#ffffff;">
        <thead style="background:#f8fafc;"><tr>${headMarkup}</tr></thead>
        <tbody>${rowMarkup}</tbody>
      </table>
    </div>
  </div>`;
};

const normalizeTabs = (value: unknown): Array<{ id: string; label: string }> => {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      { id: "overview", label: "Overview" },
      { id: "details", label: "Details" },
      { id: "history", label: "History" },
    ];
  }

  return value.map((tab, index) => {
    if (isRecord(tab)) {
      const id = firstProp(tab, ["id", "value", "key", "label"], `tab-${index + 1}`);
      const label = firstProp(tab, ["label", "title", "text", "id"], id);
      return { id, label };
    }

    const display = toDisplayValue(tab).trim();
    if (display) {
      return { id: display.toLowerCase().replaceAll(/\s+/g, "-"), label: display };
    }

    return { id: `tab-${index + 1}`, label: `Tab ${index + 1}` };
  });
};

const renderTabs = (props: Record<string, unknown>) => {
  const tabs = normalizeTabs(props.tabs ?? props.items);
  const activeId = firstProp(props, ["activeTab", "value", "defaultValue"], tabs[0]?.id ?? "");

  const tabsMarkup = tabs
    .map((tab) => {
      const active = tab.id === activeId;
      const style = active
        ? "border:1px solid #2563eb;background:#eff6ff;color:#1d4ed8;font-weight:600;"
        : "border:1px solid #cbd5e1;background:#f8fafc;color:#475569;font-weight:500;";
      return `<div data-tab-id="${escapeHtml(tab.id)}" data-active="${active ? "true" : "false"}" style="border-radius:999px;padding:6px 10px;font-size:12px;${style}">${escapeHtml(tab.label)}</div>`;
    })
    .join("");

  return `<div data-static-component="tabs" style="${baseComponentStyle}">
    <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${SURFACE.textMuted};">Tabs</div>
    <div role="tablist" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;">${tabsMarkup}</div>
  </div>`;
};

const normalizeStackItems = (props: Record<string, unknown>): string[] => {
  const source = props.items ?? props.children ?? props.values;
  if (Array.isArray(source) && source.length > 0) {
    return source
      .map((item) => {
        if (isRecord(item)) {
          return firstProp(item, ["label", "text", "title", "value"], "");
        }
        return toDisplayValue(item).trim();
      })
      .filter((item) => Boolean(item));
  }

  return [
    firstProp(props, ["title"], "Step one"),
    firstProp(props, ["subtitle"], "Step two"),
    firstProp(props, ["description"], "Step three"),
  ];
};

const renderStack = (props: Record<string, unknown>) => {
  const rawDirection = firstProp(props, ["direction", "orientation"], "vertical").toLowerCase();
  const direction = rawDirection === "horizontal" || rawDirection === "row" ? "horizontal" : "vertical";
  const gap = toCssSize(props.gap as string | number | undefined, "8px");
  const items = normalizeStackItems(props);

  const itemMarkup = items
    .map(
      (item) =>
        `<div style="border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc;padding:8px 10px;font-size:12px;color:${SURFACE.textSecondary};">${escapeHtml(item)}</div>`
    )
    .join("");

  return `<div data-static-component="stack" data-static-direction="${direction}" style="${baseComponentStyle}">
    <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${SURFACE.textMuted};">Stack</div>
    <div style="margin-top:8px;display:flex;flex-direction:${direction === "horizontal" ? "row" : "column"};gap:${gap};flex-wrap:wrap;">${itemMarkup}</div>
  </div>`;
};

const renderUnknownComponent = (
  componentName: string,
  props: Record<string, unknown>
) => {
  const propsSummary = escapeHtml(JSON.stringify(props, null, 2));

  return `<div data-static-component="unknown" style="${baseComponentStyle}">
    <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${SURFACE.textMuted};">Component</div>
    <div style="margin-top:6px;font-size:13px;font-weight:600;color:${SURFACE.textSecondary};">${escapeHtml(componentName)}</div>
    <pre style="margin-top:8px;border-radius:8px;border:1px solid #dbe3ee;background:#f8fafc;padding:8px;font-size:11px;line-height:1.45;color:${SURFACE.textSecondary};white-space:pre-wrap;word-break:break-word;">${propsSummary}</pre>
  </div>`;
};

const renderStaticComponent = (
  node: ComponentNode,
  dataContext: Record<string, unknown>
) => {
  const componentName = normalizeRefName(node.ref) || "Component";
  const normalized = componentName.toLowerCase().replaceAll(/\s+/g, "");
  const resolvedProps = resolveBindingsShared(node.props, dataContext, {
    fallback: SHOW_BINDING_EXPRESSION,
  }) as Record<string, unknown>;

  let body = "";

  if (normalized === "button" || normalized.includes("button")) {
    body = renderButton(resolvedProps);
  } else if (normalized === "card" || normalized.includes("card")) {
    body = renderCard(resolvedProps);
  } else if (normalized === "text" || normalized.includes("text") || normalized.includes("heading")) {
    body = renderText(resolvedProps);
  } else if (normalized === "input" || normalized.includes("input")) {
    body = renderInput(resolvedProps);
  } else if (normalized === "select" || normalized.includes("select")) {
    body = renderSelect(resolvedProps);
  } else if (normalized === "badge" || normalized.includes("badge")) {
    body = renderBadge(resolvedProps);
  } else if (normalized === "banner" || normalized.includes("banner") || normalized.includes("alert")) {
    body = renderBanner(resolvedProps);
  } else if (normalized === "table" || normalized.includes("table")) {
    body = renderTable(resolvedProps);
  } else if (normalized === "tabs" || normalized.includes("tabs") || normalized.includes("tabset")) {
    body = renderTabs(resolvedProps);
  } else if (normalized === "stack" || normalized.includes("stack")) {
    body = renderStack(resolvedProps);
  } else {
    body = renderUnknownComponent(componentName, resolvedProps);
  }

  return `<div data-component-id="${escapeHtml(node.id)}" data-component-ref="${escapeHtml(
    node.ref
  )}">${body}</div>`;
};

const renderStaticLayout = (
  node: LayoutNode,
  dataContext: Record<string, unknown>
) => {
  const children = node.children
    .map((child) => renderStaticNode(child, dataContext))
    .join("");

  if (node.layout.type === "stack") {
    const gap = toCssSize(node.layout.gap, "14px");
    return `<div data-static-layout="stack" style="display:flex;flex-direction:column;gap:${gap};">${children}</div>`;
  }

  const gap = toCssSize(node.layout.gap, "14px");
  const columns =
    typeof node.layout.columns === "number"
      ? `repeat(${Math.max(1, node.layout.columns)}, minmax(0, 1fr))`
      : node.layout.columns ?? "repeat(2, minmax(0, 1fr))";

  return `<div data-static-layout="grid" style="display:grid;gap:${gap};grid-template-columns:${columns};">${children}</div>`;
};

const renderStaticNode = (
  node: DesignNode,
  dataContext: Record<string, unknown>
): string => {
  if (isLayoutNode(node)) {
    return renderStaticLayout(node, dataContext);
  }
  if (isComponentNode(node)) {
    return renderStaticComponent(node, dataContext);
  }
  return "";
};

export const renderStaticDocument = (
  document: DesignDocument,
  options: StaticRendererOptions = {}
): string => {
  const dataContext = options.dataContext ?? {};
  const title = document.metadata.title?.trim() || "Untitled Preview";
  const body = renderStaticNode(document.root, dataContext);

  return `<div data-static-preview="true" style="min-height:100%;background:${SURFACE.pageBg};padding:22px 24px;color:${SURFACE.textPrimary};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:72rem;margin:0 auto;display:flex;flex-direction:column;gap:14px;">
      <div style="border-radius:16px;border:1px solid ${SURFACE.shellBorder};background:${SURFACE.shellBg};padding:14px 16px;box-shadow:0 2px 8px rgba(15,23,42,0.06);">
        <div style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${SURFACE.textMuted};">Static Preview</div>
        <div style="margin-top:6px;font-size:18px;font-weight:600;color:${SURFACE.textPrimary};">${escapeHtml(title)}</div>
      </div>
      ${body}
    </div>
  </div>`;
};
