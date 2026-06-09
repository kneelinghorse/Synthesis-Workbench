import { COMPONENT_CATALOG_TOOL_NAME } from "@/lib/runtime/tools/component-catalog-tool";
import { PATCH_NODE_TOOL_NAME, SET_DATA_CONTEXT_TOOL_NAME, SET_DOCUMENT_TOOL_NAME } from "@/lib/runtime/tools/document-tools";
import { RENDER_COMPONENT_TOOL_NAME } from "@/lib/runtime/tools/oods-tools";
import {
  LOAD_BUNDLE_TOOL_NAME,
  INSPECT_APP_TOOL_NAME,
  INSPECT_SURFACE_TOOL_NAME,
} from "@/lib/runtime/tools/stage1-tools";
import { TOKEN_ADJUSTMENT_TOOL_NAME } from "@/lib/runtime/tools/token-tools";
import { VALIDATE_SCHEMA_TOOL_NAME } from "@/lib/runtime/tools/validate-tools";

export type AnthropicToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

const REQUEST_ID_SCHEMA = {
  type: "string",
  description: "Unique request ID for traceability.",
};

const OPTIONAL_TEXT_SCHEMA = {
  type: "string",
  description: "Optional human-readable context for the request.",
};

const OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: true,
} as const;

export const getAnthropicToolDefinitions = (): AnthropicToolDefinition[] => [
  {
    name: RENDER_COMPONENT_TOOL_NAME,
    description:
      "Set a single-component document and trigger composition preview rendering.",
    input_schema: {
      type: "object",
      properties: {
        requestId: REQUEST_ID_SCHEMA,
        title: OPTIONAL_TEXT_SCHEMA,
        prompt: OPTIONAL_TEXT_SCHEMA,
        schema: OBJECT_SCHEMA,
        validate: {
          type: "boolean",
          description: "Whether to run schema validation before rendering.",
        },
      },
      required: ["requestId", "schema"],
      additionalProperties: false,
    },
  },
  {
    name: VALIDATE_SCHEMA_TOOL_NAME,
    description: "Validate a component schema against Foundry contracts.",
    input_schema: {
      type: "object",
      properties: {
        requestId: REQUEST_ID_SCHEMA,
        title: OPTIONAL_TEXT_SCHEMA,
        prompt: OPTIONAL_TEXT_SCHEMA,
        schema: OBJECT_SCHEMA,
      },
      required: ["requestId", "schema"],
      additionalProperties: false,
    },
  },
  {
    name: SET_DOCUMENT_TOOL_NAME,
    description:
      "Set the active design document in the Workbench and optionally persist it.",
    input_schema: {
      type: "object",
      properties: {
        requestId: REQUEST_ID_SCHEMA,
        title: OPTIONAL_TEXT_SCHEMA,
        prompt: OPTIONAL_TEXT_SCHEMA,
        document: OBJECT_SCHEMA,
        data: OBJECT_SCHEMA,
        slug: {
          type: "string",
          description: "Optional design slug for persistence.",
        },
        projectSlug: {
          type: "string",
          description: "Optional project slug for project-scoped design storage.",
        },
        persist: {
          type: "boolean",
          description: "When true, persist the document via project design APIs.",
        },
      },
      required: ["requestId", "document"],
      additionalProperties: false,
    },
  },
  {
    name: PATCH_NODE_TOOL_NAME,
    description:
      "Patch a node in the active design document by id, updating props or ref.",
    input_schema: {
      type: "object",
      properties: {
        requestId: REQUEST_ID_SCHEMA,
        title: OPTIONAL_TEXT_SCHEMA,
        prompt: OPTIONAL_TEXT_SCHEMA,
        nodeId: {
          type: "string",
          description: "Target node id in the active document tree.",
        },
        props: OBJECT_SCHEMA,
        ref: {
          type: "string",
          description: "Optional replacement component reference.",
        },
      },
      required: ["requestId", "nodeId"],
      additionalProperties: false,
    },
  },
  {
    name: SET_DATA_CONTEXT_TOOL_NAME,
    description:
      "Set or merge runtime data context used for $data bindings in composition.",
    input_schema: {
      type: "object",
      properties: {
        requestId: REQUEST_ID_SCHEMA,
        title: OPTIONAL_TEXT_SCHEMA,
        prompt: OPTIONAL_TEXT_SCHEMA,
        data: OBJECT_SCHEMA,
        merge: {
          type: "boolean",
          description: "When true, merge with existing data context.",
        },
      },
      required: ["requestId", "data"],
      additionalProperties: false,
    },
  },
  {
    name: TOKEN_ADJUSTMENT_TOOL_NAME,
    description:
      "Apply token path updates to the active token state (for tune-phase adjustments).",
    input_schema: {
      type: "object",
      properties: {
        requestId: REQUEST_ID_SCHEMA,
        title: OPTIONAL_TEXT_SCHEMA,
        prompt: OPTIONAL_TEXT_SCHEMA,
        changes: {
          type: "object",
          additionalProperties: {
            type: "string",
          },
          description:
            "Map of token dot-paths to new values, e.g. {\"colors.primary\":\"#2563eb\"}.",
        },
      },
      required: ["requestId", "changes"],
      additionalProperties: false,
    },
  },
  {
    name: COMPONENT_CATALOG_TOOL_NAME,
    description:
      "List available components from Foundry/fallback catalog metadata.",
    input_schema: {
      type: "object",
      properties: {
        requestId: REQUEST_ID_SCHEMA,
        title: OPTIONAL_TEXT_SCHEMA,
        prompt: OPTIONAL_TEXT_SCHEMA,
        source: {
          type: "string",
          description: "Optional preferred source (foundry or fallback).",
        },
      },
      required: ["requestId"],
      additionalProperties: false,
    },
  },
  {
    name: LOAD_BUNDLE_TOOL_NAME,
    description:
      "Load a Stage1 discovery bundle into the Workbench. Populates component inventory and token suggestions from a prior Stage1 analysis run.",
    input_schema: {
      type: "object",
      properties: {
        requestId: REQUEST_ID_SCHEMA,
        title: OPTIONAL_TEXT_SCHEMA,
        prompt: OPTIONAL_TEXT_SCHEMA,
        projectSlug: {
          type: "string",
          description:
            "Project slug to scope bundle lookup. When omitted, the active project is used.",
        },
        bundleJson: {
          type: "string",
          description:
            "Raw JSON string of a Stage1 bundle payload. Mutually exclusive with bundle.",
        },
        bundle: {
          type: "object",
          additionalProperties: true,
          description:
            "Parsed Stage1 bundle payload object. Mutually exclusive with bundleJson.",
        },
      },
      required: ["requestId"],
      additionalProperties: false,
    },
  },
  {
    name: INSPECT_APP_TOOL_NAME,
    description:
      "Run a Stage1 App Profile inspection on a URL. Performs route discovery, accessibility scan, performance analysis, and network trace. Returns a run reference that can be used with load_bundle to import discovered components and token suggestions.",
    input_schema: {
      type: "object",
      properties: {
        requestId: REQUEST_ID_SCHEMA,
        title: OPTIONAL_TEXT_SCHEMA,
        prompt: OPTIONAL_TEXT_SCHEMA,
        url: {
          type: "string",
          description: "The URL to inspect (e.g. https://example.com).",
        },
        name: {
          type: "string",
          description:
            "Optional override name for the inspection target (defaults to hostname).",
        },
        crawlDepth: {
          type: "number",
          description: "How many link-levels deep to crawl (default: 2).",
        },
        include: {
          type: "array",
          items: { type: "string" },
          description: "Pass groups to include: a11y, perf, network, all.",
        },
        components: {
          type: "boolean",
          description:
            "Enable DOM component analysis (produces component_clusters.json).",
        },
        seedRoutes: {
          type: "array",
          items: { type: "string" },
          description:
            "Seed routes to start crawling from (disables discovery when provided).",
        },
      },
      required: ["requestId", "url"],
      additionalProperties: false,
    },
  },
  {
    name: INSPECT_SURFACE_TOOL_NAME,
    description:
      "Run a Stage1 Surface Snapshot on a URL. Captures DOM structure, screenshots, computed styles, and generates a style fingerprint. Returns a run reference for loading results via load_bundle.",
    input_schema: {
      type: "object",
      properties: {
        requestId: REQUEST_ID_SCHEMA,
        title: OPTIONAL_TEXT_SCHEMA,
        prompt: OPTIONAL_TEXT_SCHEMA,
        url: {
          type: "string",
          description: "The URL or local file path to inspect.",
        },
        name: {
          type: "string",
          description:
            "Optional override name for the target (defaults to hostname or file basename).",
        },
        passes: {
          type: "array",
          items: { type: "string" },
          description: "Pass IDs to run (defaults to style.fingerprint).",
        },
        seedRoutes: {
          type: "array",
          items: { type: "string" },
          description: "Seed routes for crawling.",
        },
      },
      required: ["requestId", "url"],
      additionalProperties: false,
    },
  },
];
