"use client";

import type {
  ChatModelAdapter,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";
import type { ReadonlyJSONObject } from "assistant-stream/utils";

import {
  DEMO_TOOL_NAME,
  type DemoToolArgs,
  type DemoToolResult,
} from "@/lib/runtime/tools/demo-tool";
import {
  DEFAULT_SIGNAL_SET,
  SIGNAL_TOOL_NAME,
  type SignalToolArgs,
  type SignalToolResult,
} from "@/lib/runtime/tools/signal-tool";
import {
  PHASE_TRANSITION_TOOL_NAME,
  type PhaseTransitionToolArgs,
  type PhaseTransitionToolResult,
} from "@/lib/runtime/tools/phase-transition-tool";
import {
  REVIEW_GATE_TOOL_NAME,
  type ReviewGateToolArgs,
  type ReviewGateToolResult,
} from "@/lib/runtime/tools/review-gate-tool";
import {
  TOKEN_ADJUSTMENT_TOOL_NAME,
  buildTokenChangeSummary,
  type TokenAdjustmentToolArgs,
  type TokenAdjustmentToolResult,
} from "@/lib/runtime/tools/token-tools";
import {
  FOUNDRY_TOKEN_SYNC_TOOL_NAME,
  type FoundryTokenSyncToolArgs,
  type FoundryTokenSyncToolResult,
} from "@/lib/runtime/tools/foundry-token-sync-tool";
import {
  LOAD_BUNDLE_TOOL_NAME,
  type LoadBundleToolArgs,
  type LoadBundleToolResult,
} from "@/lib/runtime/tools/stage1-tools";
import {
  RENDER_COMPONENT_TOOL_NAME,
  renderComponent,
  type RenderComponentToolArgs,
  type RenderComponentToolResult,
} from "@/lib/runtime/tools/oods-tools";
import {
  VALIDATE_SCHEMA_TOOL_NAME,
  validateSchema,
  type ValidateSchemaToolArgs,
  type ValidateSchemaToolResult,
} from "@/lib/runtime/tools/validate-tools";
import {
  SET_DOCUMENT_TOOL_NAME,
  PATCH_NODE_TOOL_NAME,
  SET_DATA_CONTEXT_TOOL_NAME,
  executeSetDocument,
  executePatchNode,
  executeSetDataContext,
  type SetDocumentToolArgs,
  type SetDocumentToolResult,
  type PatchNodeToolArgs,
  type PatchNodeToolResult,
  type SetDataContextToolArgs,
  type SetDataContextToolResult,
} from "@/lib/runtime/tools/document-tools";
import {
  EXPORT_DESIGN_TOOL_NAME,
  executeExportDesign,
  type ExportDesignToolArgs,
  type ExportDesignToolResult,
} from "@/lib/runtime/tools/export-tools";
import {
  SAVE_TEMPLATE_TOOL_NAME,
  executeSaveTemplate,
  type SaveTemplateToolArgs,
  type SaveTemplateToolResult,
} from "@/lib/runtime/tools/template-tools";
import {
  COMPONENT_CATALOG_TOOL_NAME,
  executeComponentCatalog,
  type ComponentCatalogToolArgs,
  type ComponentCatalogToolResult,
} from "@/lib/runtime/tools/component-catalog-tool";
import { listExportFormats } from "@/lib/export/format-registry";
import { DEFAULT_PHASE_ID, DEFAULT_PHASES } from "@/types/phase";
import { usePhaseStore } from "@/lib/stores/phase-state";
import { useProjectStateStore } from "@/lib/stores/project-state";
import { useTokenStateStore } from "@/lib/stores/token-state";
import { getComponentCatalogPromptSection } from "@/lib/foundry/catalog";
import {
  isToolAvailableInPhase,
  buildPhaseGateError,
} from "@/lib/runtime/tools/phase-tool-map";
import {
  applyBuiltInTemplate,
  listBuiltInTemplates,
  resolveBuiltInTemplateSlug,
} from "@/lib/templates/built-in-library";

export type ExecuteToolContext = {
  toolName: string;
  args: Record<string, unknown>;
  toolCallId: string;
  abortSignal: AbortSignal;
};

export type ToolExecuteResult = { error: string } | Record<string, unknown>;

export type ToolEnabledChatModelAdapter = ChatModelAdapter & {
  executeTool: (context: ExecuteToolContext) => Promise<ToolExecuteResult>;
};

type ToolEnabledChatModelAdapterLike = ChatModelAdapter & {
  executeTool?: (context: ExecuteToolContext) => Promise<ToolExecuteResult>;
};

/** Round-trip through JSON to produce a ReadonlyJSONObject-compatible value. */
const toJsonArgs = (args: Record<string, unknown>): ReadonlyJSONObject => {
  const parsed: unknown = JSON.parse(JSON.stringify(args));
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as ReadonlyJSONObject;
  }
  return {};
};

const TOOL_TRIGGER = "/tool";
const SIGNAL_TRIGGER = "/signal";
const PHASE_TRIGGER = "/phase";
const REVIEW_TRIGGER = "/review";
const TOKENS_TRIGGER = "/tokens";
const TOKENS_IMPORT_SUBCOMMAND = "import";
const BUNDLE_TRIGGER = "/bundle";
const RENDER_TRIGGER = "/render";
const VALIDATE_TRIGGER = "/validate";
const EXPORT_TRIGGER = "/export";
const DOC_TRIGGER = "/doc";
const DOC_TEMPLATE_SUBCOMMAND = "template";
const DOC_LOAD_SUBCOMMAND = "load";
const COMPONENTS_TRIGGER = "/components";
const TEMPLATE_TRIGGER = "/template";

/** Maps slash-command triggers to their corresponding tool names for phase gating. */
const TRIGGER_TOOL_MAP: Record<string, string> = {
  [TOOL_TRIGGER]: DEMO_TOOL_NAME,
  [SIGNAL_TRIGGER]: SIGNAL_TOOL_NAME,
  [PHASE_TRIGGER]: PHASE_TRANSITION_TOOL_NAME,
  [REVIEW_TRIGGER]: REVIEW_GATE_TOOL_NAME,
  [TOKENS_TRIGGER]: TOKEN_ADJUSTMENT_TOOL_NAME,
  [BUNDLE_TRIGGER]: LOAD_BUNDLE_TOOL_NAME,
  [RENDER_TRIGGER]: RENDER_COMPONENT_TOOL_NAME,
  [VALIDATE_TRIGGER]: VALIDATE_SCHEMA_TOOL_NAME,
  [EXPORT_TRIGGER]: EXPORT_DESIGN_TOOL_NAME,
  [COMPONENTS_TRIGGER]: COMPONENT_CATALOG_TOOL_NAME,
  [DOC_TRIGGER]: SET_DOCUMENT_TOOL_NAME,
  [TEMPLATE_TRIGGER]: SAVE_TEMPLATE_TOOL_NAME,
};

/** Prefix applied to toolCallIds generated by slash commands.
 *  On re-invocation the presence of this prefix distinguishes
 *  slash-command tool results from LLM-initiated tool results. */
const SLASH_TOOL_PREFIX = "slash:";

const slashToolCallId = (name: string): string =>
  `${SLASH_TOOL_PREFIX}${name}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;

const hasSlashToolResult = (message: ThreadMessage): boolean =>
  message.content.some(
    (part) =>
      part.type === "tool-call" &&
      typeof part.toolCallId === "string" &&
      part.toolCallId.startsWith(SLASH_TOOL_PREFIX)
  );

const buildPhaseGateErrorResult = (
  toolName: string
): ChatModelRunResult => {
  const { currentPhase, workflowMode } = usePhaseStore.getState();
  return {
    content: [
      {
        type: "text",
        text: buildPhaseGateError(toolName, currentPhase, workflowMode),
      },
    ],
    status: {
      type: "complete",
      reason: "stop",
    },
  };
};

const checkPhaseGate = (toolName: string): boolean => {
  const { currentPhase, workflowMode } = usePhaseStore.getState();
  return isToolAvailableInPhase(toolName, currentPhase, workflowMode);
};

const extractLatestUserText = (
  messages: readonly ThreadMessage[]
): string | null => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const textParts = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text);
    const text = textParts.join(" ").trim();
    if (text) return text;
  }
  return null;
};

const normalizeCommand = (text: string): string =>
  text.trim().toLowerCase();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonChanges = (input: string): Record<string, string> | null => {
  try {
    const parsed = JSON.parse(input);
    if (!isRecord(parsed)) {
      return null;
    }

    return Object.entries(parsed).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        const trimmedKey = key.trim();
        if (!trimmedKey) {
          return acc;
        }
        acc[trimmedKey] = String(value);
        return acc;
      },
      {}
    );
  } catch {
    return null;
  }
};

const parseJsonSchema = (input: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(input);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const parseTokenChanges = (input: string): Record<string, string> => {
  const trimmed = input.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith("{")) {
    const parsed = parseJsonChanges(trimmed);
    if (parsed) {
      return parsed;
    }
  }

  const segments = trimmed.split(/[\n,]+|\s+/).filter(Boolean);
  return segments.reduce<Record<string, string>>((acc, segment) => {
    const eqIndex = segment.indexOf("=");
    if (eqIndex <= 0) {
      return acc;
    }

    const path = segment.slice(0, eqIndex).trim();
    if (!path) {
      return acc;
    }

    const value = segment.slice(eqIndex + 1).trim();
    acc[path] = value;
    return acc;
  }, {});
};

const toTokenBuildString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (isRecord(value) && typeof value.name === "string" && value.name.trim()) {
    return value.name.trim();
  }

  return undefined;
};

const normalizeFoundryTokenTheme = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === "light" || normalized === "base" || normalized === "default") {
    return "light";
  }
  if (normalized === "dark" || normalized === "night") {
    return "dark";
  }
  if (
    normalized === "hc" ||
    normalized === "high-contrast" ||
    normalized === "high_contrast" ||
    normalized === "highcontrast"
  ) {
    return "hc";
  }

  return trimmed;
};

const normalizeFoundryTokenBrand = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.toLowerCase() === "default") {
    return "A";
  }

  return trimmed;
};

const parseTokenSyncArgs = (
  input: string
): Pick<FoundryTokenSyncToolArgs, "brand" | "theme"> | null => {
  const trimmed = input.trim();
  if (!trimmed.toLowerCase().startsWith(TOKENS_IMPORT_SUBCOMMAND)) {
    return null;
  }

  const remainder = trimmed.slice(TOKENS_IMPORT_SUBCOMMAND.length).trim();
  if (!remainder) {
    return {};
  }

  if (remainder.startsWith("{")) {
    const parsed = parseJsonSchema(remainder);
    if (!parsed) {
      return {};
    }
    const brand = normalizeFoundryTokenBrand(toTokenBuildString(parsed.brand));
    const theme = normalizeFoundryTokenTheme(toTokenBuildString(parsed.theme));
    if (brand || theme) {
      return { brand, theme };
    }
    return {};
  }

  return { theme: normalizeFoundryTokenTheme(remainder) };
};

const buildDemoToolCall = (description?: string): ChatModelRunResult => {
  const args: DemoToolArgs = {
    title: "Tool UI handshake",
    description:
      description?.trim() || "Confirm tool UI wiring and submit a response.",
    requestId: `demo-${Date.now()}`,
  };

  return {
    content: [
      { type: "text", text: "Launching demo tool UI." },
      {
        type: "tool-call",
        toolCallId: slashToolCallId("demo-tool"),
        toolName: DEMO_TOOL_NAME,
        args: toJsonArgs(args),
        argsText: JSON.stringify(args),
      },
    ],
    status: {
      type: "requires-action",
      reason: "tool-calls",
    },
  };
};

const buildSignalToolCall = (prompt?: string): ChatModelRunResult => {
  const args: SignalToolArgs = {
    title: "Status signal",
    prompt: prompt?.trim() || "Capture a quick signal for the current work.",
    requestId: `signal-${Date.now()}`,
    signals: DEFAULT_SIGNAL_SET,
  };

  return {
    content: [
      { type: "text", text: "Launching signal tool UI." },
      {
        type: "tool-call",
        toolCallId: slashToolCallId("signal-tool"),
        toolName: SIGNAL_TOOL_NAME,
        args: toJsonArgs(args),
        argsText: JSON.stringify(args),
      },
    ],
    status: {
      type: "requires-action",
      reason: "tool-calls",
    },
  };
};

const buildPhaseTransitionCall = (prompt?: string): ChatModelRunResult => {
  const args: PhaseTransitionToolArgs = {
    title: "Phase transition",
    prompt:
      prompt?.trim() ||
      "Request a phase change and confirm the transition details.",
    requestId: `phase-${Date.now()}`,
    phases: DEFAULT_PHASES,
    currentPhase: DEFAULT_PHASE_ID,
  };

  return {
    content: [
      { type: "text", text: "Launching phase transition tool UI." },
      {
        type: "tool-call",
        toolCallId: slashToolCallId("phase-tool"),
        toolName: PHASE_TRANSITION_TOOL_NAME,
        args: toJsonArgs(args),
        argsText: JSON.stringify(args),
      },
    ],
    status: {
      type: "requires-action",
      reason: "tool-calls",
    },
  };
};

const buildReviewGateCall = (prompt?: string): ChatModelRunResult => {
  const defaultReviewPhase =
    DEFAULT_PHASES.find((phase) => phase.requiresReview)?.id ?? DEFAULT_PHASE_ID;

  const args: ReviewGateToolArgs = {
    title: "Review gate",
    prompt:
      prompt?.trim() || "Approve or block a phase transition that needs review.",
    requestId: `review-${Date.now()}`,
    phases: DEFAULT_PHASES,
    targetPhase: defaultReviewPhase,
  };

  return {
    content: [
      { type: "text", text: "Launching review gate tool UI." },
      {
        type: "tool-call",
        toolCallId: slashToolCallId("review-tool"),
        toolName: REVIEW_GATE_TOOL_NAME,
        args: toJsonArgs(args),
        argsText: JSON.stringify(args),
      },
    ],
    status: {
      type: "requires-action",
      reason: "tool-calls",
    },
  };
};

const buildTokenAdjustmentCall = (input?: string): ChatModelRunResult => {
  const args: TokenAdjustmentToolArgs = {
    title: "Token adjustments",
    prompt: "Review and apply the proposed token updates.",
    requestId: `tokens-${Date.now()}`,
    changes: parseTokenChanges(input ?? ""),
  };

  return {
    content: [
      { type: "text", text: "Launching token adjustment tool UI." },
      {
        type: "tool-call",
        toolCallId: slashToolCallId("tokens-tool"),
        toolName: TOKEN_ADJUSTMENT_TOOL_NAME,
        args: toJsonArgs(args),
        argsText: JSON.stringify(args),
      },
    ],
    status: {
      type: "requires-action",
      reason: "tool-calls",
    },
  };
};

const buildFoundryTokenSyncCall = (
  syncArgs: Pick<FoundryTokenSyncToolArgs, "brand" | "theme">
): ChatModelRunResult => {
  const args: FoundryTokenSyncToolArgs = {
    title: "Foundry canonical token sync",
    prompt:
      "Import canonical tokens from Foundry and preserve manual overrides in the current workspace.",
    requestId: `tokens-sync-${Date.now()}`,
    preserveManualOverrides: true,
    brand: syncArgs.brand,
    theme: syncArgs.theme,
  };

  return {
    content: [
      { type: "text", text: "Launching Foundry canonical token sync." },
      {
        type: "tool-call",
        toolCallId: slashToolCallId("tokens-sync-tool"),
        toolName: FOUNDRY_TOKEN_SYNC_TOOL_NAME,
        args: toJsonArgs(args),
        argsText: JSON.stringify(args),
      },
    ],
    status: {
      type: "requires-action",
      reason: "tool-calls",
    },
  };
};

const buildLoadBundleCall = (input?: string): ChatModelRunResult => {
  const args: LoadBundleToolArgs = {
    title: "Stage1 bundle ingestion",
    prompt: "Load a Stage1 bundle to extract components and token suggestions.",
    requestId: `bundle-${Date.now()}`,
    bundleJson: input?.trim() || undefined,
  };

  return {
    content: [
      { type: "text", text: "Launching Stage1 bundle ingestion." },
      {
        type: "tool-call",
        toolCallId: slashToolCallId("bundle-tool"),
        toolName: LOAD_BUNDLE_TOOL_NAME,
        args: toJsonArgs(args),
        argsText: JSON.stringify(args),
      },
    ],
    status: {
      type: "requires-action",
      reason: "tool-calls",
    },
  };
};

const buildRenderComponentCall = (input?: string): ChatModelRunResult => {
  const trimmed = input?.trim() ?? "";
  const parsedSchema = trimmed ? parseJsonSchema(trimmed) : null;

  const args: RenderComponentToolArgs = {
    title: "Render component",
    prompt:
      "Set a single-component document and render via the composition preview pipeline.",
    requestId: `render-${Date.now()}`,
    schema: parsedSchema ?? undefined,
    validate: true,
  };

  return {
    content: [
      { type: "text", text: "Applying component document to composition preview." },
      {
        type: "tool-call",
        toolCallId: slashToolCallId("render-tool"),
        toolName: RENDER_COMPONENT_TOOL_NAME,
        args: toJsonArgs(args),
        argsText: JSON.stringify(args),
      },
    ],
    status: {
      type: "requires-action",
      reason: "tool-calls",
    },
  };
};

const buildValidateSchemaCall = (input?: string): ChatModelRunResult => {
  const trimmed = input?.trim() ?? "";
  const parsedSchema = trimmed ? parseJsonSchema(trimmed) : null;

  const args: ValidateSchemaToolArgs = {
    title: "Schema validation",
    prompt: "Validate a component schema via Foundry MCP.",
    requestId: `validate-${Date.now()}`,
    schema: parsedSchema ?? undefined,
  };

  return {
    content: [
      { type: "text", text: "Launching schema validation." },
      {
        type: "tool-call",
        toolCallId: slashToolCallId("validate-tool"),
        toolName: VALIDATE_SCHEMA_TOOL_NAME,
        args: toJsonArgs(args),
        argsText: JSON.stringify(args),
      },
    ],
    status: {
      type: "requires-action",
      reason: "tool-calls",
    },
  };
};

const parseExportInput = (
  input?: string
): { format: string; slug?: string } => {
  const parts = input?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) {
    return { format: "html" };
  }

  const registeredFormats = new Set(
    listExportFormats().map((plugin) => plugin.format.toLowerCase())
  );
  const [first, second] = parts;

  if (registeredFormats.has(first)) {
    return { format: first, slug: second };
  }

  return { format: "html", slug: first };
};

const buildExportDesignCall = (input?: string): ChatModelRunResult => {
  const { format, slug } = parseExportInput(input);

  const args: ExportDesignToolArgs = {
    title: "Export design",
    prompt: `Export the active design as ${format.toUpperCase()}.`,
    requestId: `export-${Date.now()}`,
    format,
    slug,
  };

  return {
    content: [
      { type: "text", text: `Exporting design as ${format.toUpperCase()}.` },
      {
        type: "tool-call",
        toolCallId: slashToolCallId("export-tool"),
        toolName: EXPORT_DESIGN_TOOL_NAME,
        args: toJsonArgs(args),
        argsText: JSON.stringify(args),
      },
    ],
    status: {
      type: "requires-action",
      reason: "tool-calls",
    },
  };
};

const buildSetDocumentCall = async (
  input?: string
): Promise<ChatModelRunResult> => {
  const trimmed = input?.trim() ?? "";
  const availableTemplates = listBuiltInTemplates()
    .map((template) => template.slug)
    .join(", ");

  const loadSelection = (() => {
    if (!trimmed.toLowerCase().match(/^load(\s|$)/)) {
      return null;
    }
    const rawSlug = trimmed
      .slice(DOC_LOAD_SUBCOMMAND.length)
      .trim()
      .split(/\s+/)[0];
    if (!rawSlug) {
      return { error: "Design slug required. Usage: /doc load <slug>." };
    }
    return { slug: rawSlug };
  })();

  if (loadSelection && "error" in loadSelection) {
    return {
      content: [{ type: "text", text: loadSelection.error as string }],
      status: {
        type: "complete",
        reason: "stop",
      },
    };
  }

  if (loadSelection && "slug" in loadSelection) {
    const activeProjectSlug =
      useProjectStateStore.getState().activeProjectSlug ?? undefined;
    const params = new URLSearchParams({ slug: loadSelection.slug });
    if (activeProjectSlug) {
      params.set("projectSlug", activeProjectSlug);
    }

    try {
      const response = await fetch(`/api/designs?${params.toString()}`);
      const payload = (await response.json()) as {
        loaded?: boolean;
        slug?: string;
        projectSlug?: string | null;
        document?: SetDocumentToolArgs["document"];
        dataContext?: Record<string, unknown>;
        error?: string;
      };

      if (!response.ok || payload.loaded !== true || !payload.document) {
        const fallbackError =
          payload.error ??
          `Unable to load design "${loadSelection.slug}" (${response.status}).`;
        return {
          content: [{ type: "text", text: fallbackError }],
          status: {
            type: "complete",
            reason: "stop",
          },
        };
      }

      const args: SetDocumentToolArgs = {
        title: "Load document",
        prompt: `Load persisted design "${payload.slug ?? loadSelection.slug}" into the active workspace.`,
        requestId: `doc-load-${Date.now()}`,
        document: payload.document,
        data: payload.dataContext,
        slug: payload.slug ?? loadSelection.slug,
        projectSlug:
          typeof payload.projectSlug === "string"
            ? payload.projectSlug
            : activeProjectSlug,
        persist: false,
      };

      return {
        content: [
          {
            type: "text",
            text: `Loaded persisted design "${args.slug}". Applying document state.`,
          },
          {
            type: "tool-call",
            toolCallId: slashToolCallId("doc-load-tool"),
            toolName: SET_DOCUMENT_TOOL_NAME,
            args: toJsonArgs(args),
            argsText: JSON.stringify(args),
          },
        ],
        status: {
          type: "requires-action",
          reason: "tool-calls",
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown load failure.";
      return {
        content: [{ type: "text", text: `Design load failed: ${message}` }],
        status: {
          type: "complete",
          reason: "stop",
        },
      };
    }
  }

  const templateSelection = (() => {
    if (!trimmed.toLowerCase().match(/^template(\s|$)/)) {
      return null;
    }

    const rawTemplateSlug = trimmed
      .slice(DOC_TEMPLATE_SUBCOMMAND.length)
      .trim();
    if (!rawTemplateSlug) {
      return { error: `Template name required. Available templates: ${availableTemplates}.` };
    }

    const resolved = resolveBuiltInTemplateSlug(rawTemplateSlug);
    if (!resolved) {
      return {
        error: `Unknown template "${rawTemplateSlug}". Available templates: ${availableTemplates}.`,
      };
    }

    return {
      slug: resolved,
      document: applyBuiltInTemplate(resolved),
    };
  })();

  if (templateSelection && "error" in templateSelection) {
    return {
      content: [{ type: "text", text: templateSelection.error as string }],
      status: {
        type: "complete",
        reason: "stop",
      },
    };
  }

  const parsed = trimmed ? parseJsonSchema(trimmed) : null;
  const document =
    templateSelection && "document" in templateSelection
      ? templateSelection.document
      : (parsed as unknown as SetDocumentToolArgs["document"]);
  const actionText =
    templateSelection && "slug" in templateSelection
      ? `Applying built-in template "${templateSelection.slug}".`
      : "Setting active design document.";
  const prompt =
    templateSelection && "slug" in templateSelection
      ? `Apply built-in template "${templateSelection.slug}" and set the active design document.`
      : "Set the active design document for composition preview.";

  const templateSlug =
    templateSelection && "slug" in templateSelection
      ? templateSelection.slug === "dashboard"
        ? "dashboard-starter"
        : templateSelection.slug
      : undefined;

  const args: SetDocumentToolArgs = {
    title: "Set document",
    prompt,
    requestId: `doc-${Date.now()}`,
    document,
    ...(templateSlug
      ? {
          slug: templateSlug,
          persist: true,
        }
      : {}),
  };

  return {
    content: [
      { type: "text", text: actionText },
      {
        type: "tool-call",
        toolCallId: slashToolCallId("doc-tool"),
        toolName: SET_DOCUMENT_TOOL_NAME,
        args: toJsonArgs(args),
        argsText: JSON.stringify(args),
      },
    ],
    status: {
      type: "requires-action",
      reason: "tool-calls",
    },
  };
};

const buildComponentCatalogCall = async (): Promise<ChatModelRunResult> => {
  try {
    const { snapshot } = await getComponentCatalogPromptSection({ limit: 120 });
    const args: ComponentCatalogToolArgs = {
      requestId: `components-${Date.now()}`,
      title: "Available components",
      prompt:
        snapshot.source === "foundry"
          ? "Catalog loaded from Foundry structured data."
          : "Catalog loaded from fallback component registry.",
      source: snapshot.source,
      generatedAt: snapshot.catalog.generatedAt,
      componentCount: snapshot.catalog.componentCount,
      components: snapshot.catalog.components.slice(0, 120).map((component) => ({
        id: component.id,
        name: component.name,
        description: component.description,
        requiredProps: component.requiredProps,
        traits: component.traits,
        variants: component.variants,
      })),
    };

    return {
      content: [
        {
          type: "text",
          text: `Loaded ${snapshot.catalog.componentCount} component${
            snapshot.catalog.componentCount === 1 ? "" : "s"
          } from ${snapshot.source}.`,
        },
        {
          type: "tool-call",
          toolCallId: slashToolCallId("components-tool"),
          toolName: COMPONENT_CATALOG_TOOL_NAME,
          args: toJsonArgs(args),
          argsText: JSON.stringify(args),
        },
      ],
      status: {
        type: "requires-action",
        reason: "tool-calls",
      },
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Unable to load component catalog: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      status: {
        type: "complete",
        reason: "stop",
      },
    };
  }
};

const TEMPLATE_CATEGORIES = [
  "dashboard",
  "form",
  "landing",
  "settings",
  "detail",
  "other",
] as const;

const isTemplateCategory = (
  value: string
): value is SaveTemplateToolArgs["category"] =>
  (TEMPLATE_CATEGORIES as readonly string[]).includes(value);

const buildSaveTemplateCall = (input?: string): ChatModelRunResult => {
  const trimmed = input?.trim() ?? "";
  const payloadText = trimmed.toLowerCase().startsWith("save ")
    ? trimmed.slice("save ".length).trim()
    : trimmed;
  const parsed = payloadText ? parseJsonSchema(payloadText) : null;

  if (!parsed) {
    return {
      content: [
        {
          type: "text",
          text:
            'Template save requires JSON args. Example: /template save {"name":"My Template","description":"Reusable starter","category":"dashboard","slug":"my-template"}',
        },
      ],
      status: {
        type: "complete",
        reason: "stop",
      },
    };
  }

  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const description =
    typeof parsed.description === "string" ? parsed.description.trim() : "";
  const categoryRaw =
    typeof parsed.category === "string" ? parsed.category.trim().toLowerCase() : "";
  const slug = typeof parsed.slug === "string" ? parsed.slug.trim() : undefined;
  const previewThumbnail =
    typeof parsed.previewThumbnail === "string"
      ? parsed.previewThumbnail.trim()
      : undefined;
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((entry): entry is string => typeof entry === "string")
    : undefined;

  if (!name || !description || !categoryRaw) {
    return {
      content: [
        {
          type: "text",
          text:
            'Template save requires "name", "description", and "category". Example category: dashboard, form, landing, settings, detail, other.',
        },
      ],
      status: {
        type: "complete",
        reason: "stop",
      },
    };
  }

  if (!isTemplateCategory(categoryRaw)) {
    return {
      content: [
        {
          type: "text",
          text: `Invalid template category "${categoryRaw}". Allowed categories: ${TEMPLATE_CATEGORIES.join(", ")}.`,
        },
      ],
      status: {
        type: "complete",
        reason: "stop",
      },
    };
  }

  const args: SaveTemplateToolArgs = {
    requestId: `template-save-${Date.now()}`,
    title: "Save as template",
    prompt: "Save active design as reusable template.",
    slug,
    name,
    description,
    category: categoryRaw,
    previewThumbnail,
    tags,
    tokenOverrides: isRecord(parsed.tokenOverrides)
      ? (parsed.tokenOverrides as SaveTemplateToolArgs["tokenOverrides"])
      : undefined,
    dataShape: isRecord(parsed.dataShape)
      ? (parsed.dataShape as SaveTemplateToolArgs["dataShape"])
      : undefined,
  };

  return {
    content: [
      { type: "text", text: `Saving template "${name}".` },
      {
        type: "tool-call",
        toolCallId: slashToolCallId("template-save"),
        toolName: SAVE_TEMPLATE_TOOL_NAME,
        args: toJsonArgs(args),
        argsText: JSON.stringify(args),
      },
    ],
    status: {
      type: "requires-action",
      reason: "tool-calls",
    },
  };
};

const extractSetDocumentResult = (
  message: ThreadMessage
): SetDocumentToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== SET_DOCUMENT_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as SetDocumentToolResult;
  }
  return null;
};

const extractPatchNodeResult = (
  message: ThreadMessage
): PatchNodeToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== PATCH_NODE_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as PatchNodeToolResult;
  }
  return null;
};

const extractSetDataContextResult = (
  message: ThreadMessage
): SetDataContextToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== SET_DATA_CONTEXT_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as SetDataContextToolResult;
  }
  return null;
};

const extractDemoToolResult = (message: ThreadMessage): DemoToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== DEMO_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as DemoToolResult;
  }
  return null;
};

const extractSignalToolResult = (
  message: ThreadMessage
): SignalToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== SIGNAL_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as SignalToolResult;
  }
  return null;
};

const extractPhaseTransitionResult = (
  message: ThreadMessage
): PhaseTransitionToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== PHASE_TRANSITION_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as PhaseTransitionToolResult;
  }
  return null;
};

const extractReviewGateResult = (
  message: ThreadMessage
): ReviewGateToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== REVIEW_GATE_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as ReviewGateToolResult;
  }
  return null;
};

const extractTokenAdjustmentResult = (
  message: ThreadMessage
): TokenAdjustmentToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== TOKEN_ADJUSTMENT_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as TokenAdjustmentToolResult;
  }
  return null;
};

const extractFoundryTokenSyncResult = (
  message: ThreadMessage
): FoundryTokenSyncToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== FOUNDRY_TOKEN_SYNC_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as FoundryTokenSyncToolResult;
  }
  return null;
};

const extractLoadBundleResult = (
  message: ThreadMessage
): LoadBundleToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== LOAD_BUNDLE_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as LoadBundleToolResult;
  }
  return null;
};

const extractRenderComponentResult = (
  message: ThreadMessage
): RenderComponentToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== RENDER_COMPONENT_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as RenderComponentToolResult;
  }
  return null;
};

const extractValidateSchemaResult = (
  message: ThreadMessage
): ValidateSchemaToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== VALIDATE_SCHEMA_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as ValidateSchemaToolResult;
  }
  return null;
};

const extractExportDesignResult = (
  message: ThreadMessage
): ExportDesignToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== EXPORT_DESIGN_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as ExportDesignToolResult;
  }
  return null;
};

const extractSaveTemplateResult = (
  message: ThreadMessage
): SaveTemplateToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== SAVE_TEMPLATE_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as SaveTemplateToolResult;
  }
  return null;
};

const extractComponentCatalogResult = (
  message: ThreadMessage
): ComponentCatalogToolResult | null => {
  if (message.role !== "assistant") return null;
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.toolName !== COMPONENT_CATALOG_TOOL_NAME) continue;
    if (!part.result || part.isError) continue;
    return part.result as ComponentCatalogToolResult;
  }
  return null;
};

const formatCount = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const isAsyncRunResult = (
  result: ReturnType<ChatModelAdapter["run"]>
): result is AsyncGenerator<ChatModelRunResult, void> =>
  typeof result === "object" &&
  result !== null &&
  Symbol.asyncIterator in result;

const toRunGenerator = (
  result: ReturnType<ChatModelAdapter["run"]>
): AsyncGenerator<ChatModelRunResult, void> => {
  if (isAsyncRunResult(result)) {
    return result;
  }

  return (async function* () {
    yield (await result) as ChatModelRunResult;
  })();
};

export const withToolCommands = (
  adapter: ToolEnabledChatModelAdapterLike,
  options: { systemPromptOverride?: string | null } = {}
): ToolEnabledChatModelAdapter => {
  const run: ChatModelAdapter["run"] = async function* (initialRunOptions) {
    let runOptions = initialRunOptions;

    const interceptedResult = await (async (): Promise<ChatModelRunResult | null> => {
      const resolve = (result: ChatModelRunResult) => Promise.resolve(result);
      const latestUserText = extractLatestUserText(runOptions.messages);
      const normalizedLatestUserText = latestUserText
        ? normalizeCommand(latestUserText)
        : null;
      const isSlashCommandRequest =
        normalizedLatestUserText !== null &&
        Object.keys(TRIGGER_TOOL_MAP).some((trigger) =>
          normalizedLatestUserText.startsWith(trigger)
        );

      const baseOverride = options.systemPromptOverride?.trim() ?? "";
      const includesCatalogSection = baseOverride.includes(
        "OODS COMPONENT CATALOG"
      );
      let catalogPrompt = "";
      try {
        const catalogSection = await getComponentCatalogPromptSection({ limit: 60 });
        catalogPrompt = catalogSection.prompt;
      } catch {
        catalogPrompt = "";
      }
      const overrideParts = [baseOverride];
      if (!includesCatalogSection && catalogPrompt) {
        overrideParts.push(catalogPrompt);
      }
      const override = overrideParts.filter(Boolean).join("\n\n");

      // Inject system prompt override (system messages are single Text parts).
      if (override) {
        const messages = [...runOptions.messages];
        const systemMessageIndex = messages.findIndex((m) => m.role === "system");

        if (systemMessageIndex !== -1) {
          const systemMessage = messages[systemMessageIndex];
          if (systemMessage.role === "system") {
            const existingText = systemMessage.content[0]?.text ?? "";
            const mergedText = existingText
              ? `${existingText}\n\n${override}`
              : override;
            messages[systemMessageIndex] = {
              ...systemMessage,
              content: [{ type: "text", text: mergedText }] as const,
            };
          }
        } else {
          messages.unshift({
            id: `system-override-${Date.now()}`,
            createdAt: new Date(),
            role: "system",
            content: [{ type: "text", text: override }] as const,
            metadata: {
              custom: {},
            },
          });
        }

        runOptions = {
          ...runOptions,
          messages,
        };
      }

      if (latestUserText && normalizedLatestUserText) {
        const normalized = normalizedLatestUserText;

        // Find the matching trigger and check phase gate
        for (const [trigger, toolName] of Object.entries(TRIGGER_TOOL_MAP)) {
          if (normalized.startsWith(trigger) && !checkPhaseGate(toolName)) {
            return resolve(buildPhaseGateErrorResult(toolName));
          }
        }

        if (normalized.startsWith(SIGNAL_TRIGGER)) {
          const prompt = latestUserText.slice(SIGNAL_TRIGGER.length).trim();
          return resolve(buildSignalToolCall(prompt));
        }
        if (normalized.startsWith(REVIEW_TRIGGER)) {
          const prompt = latestUserText.slice(REVIEW_TRIGGER.length).trim();
          return resolve(buildReviewGateCall(prompt));
        }
        if (normalized.startsWith(TOKENS_TRIGGER)) {
          const input = latestUserText.slice(TOKENS_TRIGGER.length).trim();
          const syncArgs = parseTokenSyncArgs(input);
          if (syncArgs) {
            return resolve(buildFoundryTokenSyncCall(syncArgs));
          }
          return resolve(buildTokenAdjustmentCall(input));
        }
        if (normalized.startsWith(BUNDLE_TRIGGER)) {
          const input = latestUserText.slice(BUNDLE_TRIGGER.length).trim();
          return resolve(buildLoadBundleCall(input));
        }
        if (normalized.startsWith(RENDER_TRIGGER)) {
          const input = latestUserText.slice(RENDER_TRIGGER.length).trim();
          return resolve(buildRenderComponentCall(input));
        }
        if (normalized.startsWith(VALIDATE_TRIGGER)) {
          const input = latestUserText.slice(VALIDATE_TRIGGER.length).trim();
          return resolve(buildValidateSchemaCall(input));
        }
        if (normalized.startsWith(EXPORT_TRIGGER)) {
          const input = latestUserText.slice(EXPORT_TRIGGER.length).trim();
          return resolve(buildExportDesignCall(input));
        }
        if (normalized.startsWith(COMPONENTS_TRIGGER)) {
          return buildComponentCatalogCall();
        }
        if (normalized.startsWith(DOC_TRIGGER)) {
          const input = latestUserText.slice(DOC_TRIGGER.length).trim();
          return buildSetDocumentCall(input);
        }
        if (normalized.startsWith(TEMPLATE_TRIGGER)) {
          const input = latestUserText.slice(TEMPLATE_TRIGGER.length).trim();
          return resolve(buildSaveTemplateCall(input));
        }
        if (normalized.startsWith(PHASE_TRIGGER)) {
          const prompt = latestUserText.slice(PHASE_TRIGGER.length).trim();
          return resolve(buildPhaseTransitionCall(prompt));
        }
        if (normalized.startsWith(TOOL_TRIGGER)) {
          const description = latestUserText.slice(TOOL_TRIGGER.length).trim();
          return resolve(buildDemoToolCall(description));
        }
      }

      const currentMessage = runOptions.unstable_getMessage?.();
      // Only intercept tool results from slash commands. When the LLM
      // autonomously chains tool calls (e.g. compose→export), the results
      // must flow back to the LLM so it can decide the next step.
      // Slash-command-generated tool calls carry the SLASH_TOOL_PREFIX in
      // their toolCallId, which lets us distinguish them from LLM-initiated
      // tool calls on re-invocation (when latestUserText is absent).
      if (currentMessage && hasSlashToolResult(currentMessage)) {
        const demoResult = extractDemoToolResult(currentMessage);
        if (demoResult) {
          return resolve({
            content: [
              {
                type: "text",
                text: `Demo tool result captured: ${demoResult.notes || "Acknowledged."
                  }`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const signalResult = extractSignalToolResult(currentMessage);
        if (signalResult) {
          return resolve({
            content: [
              {
                type: "text",
                text: `Signal recorded: ${signalResult.signal}.`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const phaseResult = extractPhaseTransitionResult(currentMessage);
        if (phaseResult) {
          return resolve({
            content: [
              {
                type: "text",
                text: `Phase transitioned: ${phaseResult.previousPhase} -> ${phaseResult.nextPhase}.`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const reviewResult = extractReviewGateResult(currentMessage);
        if (reviewResult) {
          return resolve({
            content: [
              {
                type: "text",
                text: `Review gate decision recorded: ${reviewResult.phase} -> ${reviewResult.decision}.`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const foundrySyncResult = extractFoundryTokenSyncResult(currentMessage);
        if (foundrySyncResult) {
          const unmappedCount =
            foundrySyncResult.unmappedFoundryPaths?.length ?? 0;
          const invalidCount = foundrySyncResult.invalidPaths?.length ?? 0;
          const warnings =
            unmappedCount + invalidCount > 0
              ? ` ${formatCount(unmappedCount, "unmapped path")}, ${formatCount(
                  invalidCount,
                  "invalid path"
                )}.`
              : "";

          return resolve({
            content: [
              {
                type: "text",
                text: `Foundry canonical sync applied: ${formatCount(
                  foundrySyncResult.appliedCount ?? 0,
                  "token"
                )}. Preserved ${formatCount(
                  foundrySyncResult.preservedOverrideCount ?? 0,
                  "manual override"
                )}.${warnings}`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const tokenResult = extractTokenAdjustmentResult(currentMessage);
        if (tokenResult) {
          const appliedCount = tokenResult.appliedCount ?? 0;
          const invalidCount = tokenResult.invalidPaths?.length ?? 0;
          const invalidNote =
            invalidCount > 0
              ? ` ${formatCount(invalidCount, "invalid path")} blocked.`
              : "";
          return resolve({
            content: [
              {
                type: "text",
                text: `Token update applied: ${formatCount(
                  appliedCount,
                  "change"
                )}.${invalidNote}`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const bundleResult = extractLoadBundleResult(currentMessage);
        if (bundleResult) {
          const componentCount = bundleResult.componentCount ?? 0;
          const tokenCount = bundleResult.tokenSuggestionCount ?? 0;
          const errorNote =
            bundleResult.errors && bundleResult.errors.length > 0
              ? ` Errors: ${bundleResult.errors.join(" ")}`
              : "";
          return resolve({
            content: [
              {
                type: "text",
                text: `Stage1 bundle loaded: ${formatCount(
                  componentCount,
                  "component"
                )}, ${formatCount(tokenCount, "token suggestion")}.${errorNote}`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const renderResult = extractRenderComponentResult(currentMessage);
        if (renderResult) {
          const errorNote =
            renderResult.errors && renderResult.errors.length > 0
              ? ` Errors: ${renderResult.errors.join(" ")}`
              : "";
          return resolve({
            content: [
              {
                type: "text",
                text: renderResult.rendered
                  ? "Component document applied. Preview rendering."
                  : `Component render failed.${errorNote}`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const validateResult = extractValidateSchemaResult(currentMessage);
        if (validateResult) {
          const errorCount = validateResult.errors?.length ?? 0;
          const warningCount = validateResult.warnings?.length ?? 0;
          const errorNote =
            errorCount > 0
              ? ` ${formatCount(errorCount, "error")}: ${validateResult.errors.join("; ")}`
              : "";
          const warningNote =
            warningCount > 0 ? ` ${formatCount(warningCount, "warning")}.` : "";
          return resolve({
            content: [
              {
                type: "text",
                text: validateResult.valid
                  ? `Schema validation passed.${warningNote}`
                  : `Schema validation failed.${errorNote}${warningNote}`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const exportResult = extractExportDesignResult(currentMessage);
        if (exportResult) {
          const errorNote =
            exportResult.errors && exportResult.errors.length > 0
              ? ` Errors: ${exportResult.errors.join(" ")}`
              : "";
          return resolve({
            content: [
              {
                type: "text",
                text: exportResult.exported
                  ? `Export complete: ${exportResult.format.toUpperCase()} (${exportResult.content.length} characters).`
                  : `Export failed.${errorNote}`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const saveTemplateResult = extractSaveTemplateResult(currentMessage);
        if (saveTemplateResult) {
          const errorNote =
            saveTemplateResult.errors && saveTemplateResult.errors.length > 0
              ? ` Errors: ${saveTemplateResult.errors.join(" ")}`
              : "";
          return resolve({
            content: [
              {
                type: "text",
                text: saveTemplateResult.saved
                  ? `Template saved: ${saveTemplateResult.slug} (${formatCount(
                      saveTemplateResult.requiredComponents.length,
                      "required component"
                    )}).`
                  : `Template save failed.${errorNote}`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const componentCatalogResult =
          extractComponentCatalogResult(currentMessage);
        if (componentCatalogResult) {
          return resolve({
            content: [
              {
                type: "text",
                text: `Component catalog listed: ${formatCount(
                  componentCatalogResult.componentCount,
                  "component"
                )} from ${componentCatalogResult.source}.`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const docResult = extractSetDocumentResult(currentMessage);
        if (docResult) {
          const errorNote =
            docResult.errors && docResult.errors.length > 0
              ? ` Errors: ${docResult.errors.join(" ")}`
              : "";
          return resolve({
            content: [
              {
                type: "text",
                text: docResult.saved
                  ? `Document set: ${formatCount(
                      docResult.nodeCount,
                      "node"
                    )}, ${formatCount(
                      docResult.componentCount,
                      "component"
                    )}. Preview rendering.`
                  : `Document failed.${errorNote}`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const patchResult = extractPatchNodeResult(currentMessage);
        if (patchResult) {
          const errorNote =
            patchResult.errors && patchResult.errors.length > 0
              ? ` Errors: ${patchResult.errors.join(" ")}`
              : "";
          return resolve({
            content: [
              {
                type: "text",
                text: patchResult.patched
                  ? `Node "${patchResult.nodeId}" patched. Preview re-rendering.`
                  : `Patch failed for "${patchResult.nodeId}".${errorNote}`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }

        const dataContextResult = extractSetDataContextResult(currentMessage);
        if (dataContextResult) {
          const errorNote =
            dataContextResult.errors && dataContextResult.errors.length > 0
              ? ` Errors: ${dataContextResult.errors.join(" ")}`
              : "";
          return resolve({
            content: [
              {
                type: "text",
                text: dataContextResult.updated
                  ? `Data context updated: ${formatCount(
                      dataContextResult.keyCount,
                      "key"
                    )}. Bindings will resolve on next render.`
                  : `Data context update failed.${errorNote}`,
              },
            ],
            status: {
              type: "complete",
              reason: "stop",
            },
          });
        }
      }

      return null;
    })();

    if (interceptedResult) {
      yield interceptedResult;
      return;
    }

    yield* toRunGenerator(adapter.run(runOptions));
  };

  const executeTool: ToolEnabledChatModelAdapter["executeTool"] = async ({
    toolName,
    args,
    toolCallId,
    abortSignal,
  }) => {
    // Phase gating — block tools that aren't available in current phase
    if (!checkPhaseGate(toolName)) {
      const { currentPhase, workflowMode } = usePhaseStore.getState();
      return {
        error: buildPhaseGateError(toolName, currentPhase, workflowMode),
      };
    }

    // Route to local executors
    if (toolName === RENDER_COMPONENT_TOOL_NAME) {
      return await renderComponent(args as RenderComponentToolArgs);
    }

    if (toolName === VALIDATE_SCHEMA_TOOL_NAME) {
      return await validateSchema(args as ValidateSchemaToolArgs);
    }

    if (toolName === SET_DOCUMENT_TOOL_NAME) {
      return executeSetDocument(args as SetDocumentToolArgs);
    }

    if (toolName === PATCH_NODE_TOOL_NAME) {
      return executePatchNode(args as PatchNodeToolArgs);
    }

    if (toolName === SET_DATA_CONTEXT_TOOL_NAME) {
      return executeSetDataContext(args as SetDataContextToolArgs);
    }

    if (toolName === TOKEN_ADJUSTMENT_TOOL_NAME) {
      const toolArgs = args as TokenAdjustmentToolArgs;
      const tokenStore = useTokenStateStore.getState();
      const { validChanges, invalidPaths } = buildTokenChangeSummary(
        tokenStore.tokens,
        toolArgs.changes ?? {}
      );
      tokenStore.setTokens(validChanges, "manual");
      return {
        applied: true,
        appliedCount: Object.keys(validChanges).length,
        invalidPaths,
        resolvedAt: new Date().toISOString(),
      } satisfies TokenAdjustmentToolResult;
    }

    if (toolName === EXPORT_DESIGN_TOOL_NAME) {
      return executeExportDesign(args as ExportDesignToolArgs);
    }

    if (toolName === SAVE_TEMPLATE_TOOL_NAME) {
      return await executeSaveTemplate(args as SaveTemplateToolArgs);
    }

    if (toolName === COMPONENT_CATALOG_TOOL_NAME) {
      return executeComponentCatalog(args as Partial<ComponentCatalogToolArgs>);
    }

    // Delegate to wrapped adapter's executeTool for tools without local executors
    // (e.g. load_bundle, demo_tool, signal_tool, phase_transition, etc.)
    if (adapter.executeTool) {
      return await adapter.executeTool({ toolName, args, toolCallId, abortSignal });
    }

    return { error: `No executor registered for tool "${toolName}".` };
  };

  return {
    run,
    executeTool,
  };
};
