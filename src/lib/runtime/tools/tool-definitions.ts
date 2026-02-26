import { COMPONENT_CATALOG_TOOL_NAME } from "@/lib/runtime/tools/component-catalog-tool";
import { PATCH_NODE_TOOL_NAME, SET_DATA_CONTEXT_TOOL_NAME, SET_DOCUMENT_TOOL_NAME } from "@/lib/runtime/tools/document-tools";
import { EXPORT_DESIGN_TOOL_NAME } from "@/lib/runtime/tools/export-tools";
import { RENDER_COMPONENT_TOOL_NAME } from "@/lib/runtime/tools/oods-tools";
import { LOAD_BUNDLE_TOOL_NAME } from "@/lib/runtime/tools/stage1-tools";
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
    name: EXPORT_DESIGN_TOOL_NAME,
    description: "Export the active design in html/json/yaml/spec/scss formats.",
    input_schema: {
      type: "object",
      properties: {
        requestId: REQUEST_ID_SCHEMA,
        title: OPTIONAL_TEXT_SCHEMA,
        prompt: OPTIONAL_TEXT_SCHEMA,
        format: {
          type: "string",
          description: "Export format: html, json, yaml, spec, or scss.",
        },
        slug: {
          type: "string",
          description: "Optional slug override for export metadata.",
        },
      },
      required: ["requestId", "format"],
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
];
