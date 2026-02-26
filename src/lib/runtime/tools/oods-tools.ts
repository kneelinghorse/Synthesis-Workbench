import { getFoundryMcpClient } from "@/lib/mcp/foundry-client";
import { formatMcpServiceError } from "@/lib/mcp/user-facing-errors";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import type { DesignDocument, DesignNode } from "@/types/document-model";

export const RENDER_COMPONENT_TOOL_NAME = "render_component";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const normalizeComponentRef = (value: string) =>
  value.startsWith("oods:") ? value : `oods:${value}`;

const isDesignNode = (value: unknown): value is DesignNode =>
  isRecord(value) && (value.nodeType === "layout" || value.nodeType === "component");

const isDesignDocument = (value: unknown): value is DesignDocument =>
  isRecord(value) && isDesignNode(value.root);

const countNodes = (node: DesignNode): number => {
  if (node.nodeType === "component") {
    return 1;
  }
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
};

const countComponents = (node: DesignNode): number => {
  if (node.nodeType === "component") {
    return 1;
  }
  return node.children.reduce((sum, child) => sum + countComponents(child), 0);
};

const getFirstComponentRef = (node: DesignNode): string | undefined => {
  if (node.nodeType === "component") {
    return node.ref;
  }
  for (const child of node.children) {
    const found = getFirstComponentRef(child);
    if (found) return found;
  }
  return undefined;
};

const COMPONENT_CONTROL_KEYS = new Set([
  "id",
  "name",
  "type",
  "ref",
  "component",
  "props",
  "schema",
  "screens",
  "version",
  "mode",
  "patch",
  "baseTree",
  "options",
]);

const extractFallbackProps = (value: Record<string, unknown>) => {
  const props = Object.entries(value).reduce<Record<string, unknown>>(
    (acc, [key, entry]) => {
      if (COMPONENT_CONTROL_KEYS.has(key)) {
        return acc;
      }
      acc[key] = entry;
      return acc;
    },
    {}
  );
  return Object.keys(props).length > 0 ? props : {};
};

const toSingleComponentDocument = (
  schema: unknown,
  requestId: string,
  title?: string
): DesignDocument | null => {
  if (isDesignDocument(schema)) {
    return schema;
  }

  if (!isRecord(schema)) {
    return null;
  }

  const payload = isRecord(schema.schema) ? schema.schema : schema;
  if (!isRecord(payload)) {
    return null;
  }

  const screens = Array.isArray(payload.screens)
    ? payload.screens.filter((entry): entry is Record<string, unknown> =>
        isRecord(entry)
      )
    : [];

  if (screens.length > 0) {
    const firstScreen = screens[0];
    const componentName =
      toStringValue(firstScreen.component) ??
      toStringValue(firstScreen.ref) ??
      "Button";

    return {
      metadata: {
        title:
          title ??
          `Render ${componentName.replace(/^oods:/, "")}`,
      },
      root: {
        nodeType: "component",
        id: toStringValue(firstScreen.id) ?? `${requestId}-component`,
        ref: normalizeComponentRef(componentName),
        props: isRecord(firstScreen.props)
          ? firstScreen.props
          : extractFallbackProps(firstScreen),
      },
    };
  }

  const rawType = toStringValue(payload.type);
  const componentName =
    toStringValue(payload.component) ??
    toStringValue(payload.ref) ??
    (rawType && rawType.toLowerCase() !== "component" ? rawType : undefined) ??
    toStringValue(payload.name) ??
    "Button";

  return {
    metadata: {
      title:
        title ??
        `Render ${componentName.replace(/^oods:/, "")}`,
    },
    root: {
      nodeType: "component",
      id: toStringValue(payload.id) ?? `${requestId}-component`,
      ref: normalizeComponentRef(componentName),
      props: isRecord(payload.props) ? payload.props : extractFallbackProps(payload),
    },
  };
};

export type RenderComponentToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  schema?: unknown;
  validate?: boolean;
};

export type RenderComponentToolResult = {
  rendered: boolean;
  html?: string;
  documentSet?: boolean;
  nodeCount?: number;
  componentCount?: number;
  componentRef?: string;
  warnings?: string[];
  errors?: string[];
  validationSkipped?: boolean;
  resolvedAt: string;
};

export const renderComponent = async (
  args: RenderComponentToolArgs
): Promise<RenderComponentToolResult> => {
  try {
    let validationWarnings: string[] | undefined;

    // Optional pre-render validation
    if (args.validate) {
      const client = getFoundryMcpClient();
      const validation = await client.validate(args.schema);
      if (!validation.valid) {
        return {
          rendered: false,
          errors: validation.errors,
          warnings: validation.warnings,
          resolvedAt: new Date().toISOString(),
        };
      }
      validationWarnings = validation.warnings;
    }

    const document = toSingleComponentDocument(args.schema, args.requestId, args.title);
    if (!document) {
      return {
        rendered: false,
        errors: [
          "No component schema provided. Pass a component schema or document to render.",
        ],
        resolvedAt: new Date().toISOString(),
      };
    }

    useDocumentStateStore.getState().setDocument(document);

    return {
      rendered: true,
      documentSet: true,
      nodeCount: countNodes(document.root),
      componentCount: countComponents(document.root),
      componentRef: getFirstComponentRef(document.root),
      warnings: validationWarnings,
      validationSkipped: !args.validate,
      resolvedAt: new Date().toISOString(),
    };
  } catch (error) {
    const formatted = formatMcpServiceError("foundry", error, {
      operation: args.validate
        ? "validating the component schema"
        : "preparing the component preview document",
    });
    const errors = [formatted];
    const code = isRecord(error) && typeof error.code === "string" ? error.code : undefined;
    if (!code) {
      const raw = error instanceof Error ? error.message : String(error);
      const trimmed = raw.trim();
      if (trimmed) {
        errors.push(trimmed);
      }
    }
    return {
      rendered: false,
      errors,
      resolvedAt: new Date().toISOString(),
    };
  }
};
