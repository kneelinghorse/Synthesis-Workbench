"use client";

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { useStage1BundleStore } from "@/lib/stores/stage1-bundle";
import { createFoundryMcpClient } from "@/lib/mcp/foundry-client";
import {
    formatFoundryCatalogForPrompt,
    normalizeFoundryComponentCatalog,
    WORKBENCH_S44_COMPONENTS,
} from "@/lib/foundry/catalog";

// ============================================================================
// Document Authoring System Prompt
// ============================================================================

const DOCUMENT_AUTHORING_PROMPT = `
# DOCUMENT AUTHORING (WORKBENCH)

You have native tool-calling capabilities. Use **tool_use** to drive all design operations autonomously.
Do NOT suggest slash commands — call tools directly to create, modify, and render designs.

## Available Tools

### set_document
Creates or replaces the active design document. Automatically rendered in the Preview Pane.
**Call this tool** when the user asks you to create or update a design.

Required: requestId (string), document (DesignDocument JSON)
Optional: slug (string), projectSlug (string), persist (boolean), data (object)

### patch_node
Modifies a specific ComponentNode by ID in the active document. Use for targeted edits.

Required: requestId (string), nodeId (string)
Optional: props (object), ref (string, e.g. "oods:Button")

### render_component
Sets a single-component document from a schema and triggers preview rendering.

Required: requestId (string), schema (object)
Optional: validate (boolean)

### validate_schema
Validates a component schema against Foundry contracts.

Required: requestId (string), schema (object)

### export_design
Exports the active design in html/json/yaml/spec/scss formats.

Required: requestId (string), format (string)
Optional: slug (string)

### update_token_state
Applies token path updates to the active preview state.

Required: requestId (string), changes (object — map of dot-paths to values)

### component_catalog
Lists available components from the Foundry/fallback catalog.

Required: requestId (string)

### set_data_context
Sets or merges runtime data context for $data bindings.

Required: requestId (string), data (object)
Optional: merge (boolean)

### load_bundle
Loads a Stage1 discovery bundle into the Workbench. Populates the component inventory and token suggestions from a prior Stage1 analysis run. Call this when the user wants to import discovery data or when no Stage1 context is present yet.

Required: requestId (string)
Optional: projectSlug (string), bundleJson (string), bundle (object)

## Document Model

A DesignDocument has this structure:
\`\`\`json
{
  "metadata": { "title": "My Design", "description": "..." },
  "root": <DesignNode>
}
\`\`\`

A DesignNode is either a LayoutNode or ComponentNode:

**ComponentNode** — References an OODS component:
\`\`\`json
{ "nodeType": "component", "id": "unique-id", "ref": "oods:ComponentName", "props": { ... } }
\`\`\`

**LayoutNode** — Arranges children in stack (vertical) or grid:
\`\`\`json
{ "nodeType": "layout", "layout": { "type": "stack", "gap": 16, "align": "center" }, "children": [ ... ] }
{ "nodeType": "layout", "layout": { "type": "grid", "columns": 3, "gap": 16 }, "children": [ ... ] }
\`\`\`

## OODS Component Catalog

The component catalog is *optionally* loaded from Foundry via \`structuredData.fetch\` (may be unavailable depending on bridge policy).
Reference components using "oods:Name" format in ComponentNode.ref.
For Workbench document composition, use only this S44 set:
\`${WORKBENCH_S44_COMPONENTS.map((name) => `oods:${name}`).join(", ")}\`
When catalog data is available, it will include traits, required props, and variants.

## Workflow Guidelines
- Every ComponentNode needs a unique "id" for AI-patching
- Use LayoutNodes to arrange components (stack for vertical, grid for columns)
- Nesting is supported: stack inside grid, grid inside stack, etc.
- When the user describes a layout, call set_document with the full DesignDocument JSON
- For targeted edits, call patch_node with the nodeId and changes
- For single-component previews, call render_component with the component schema
- Chain tool calls: e.g. set_document then render_component for a full workflow
`;

type ResearchContextValue = {
    researchPrompt: string | null;
    componentCount: number;
    tokenCount: number;
    foundryCatalogCount: number;
};

const ResearchContext = createContext<ResearchContextValue | null>(null);

export const useResearchContext = () => {
    const context = useContext(ResearchContext);
    if (!context) {
        throw new Error("useResearchContext must be used within a ResearchProvider");
    }
    return context;
};

type ResearchProviderProps = {
    children: ReactNode;
};

export const ResearchProvider = ({ children }: ResearchProviderProps) => {
    const components = useStage1BundleStore((state) => state.components);
    const tokenSuggestions = useStage1BundleStore((state) => state.tokenSuggestions);
    const [foundryCatalogPrompt, setFoundryCatalogPrompt] = useState<string | null>(
        null
    );
    const [foundryCatalogCount, setFoundryCatalogCount] = useState(0);

    useEffect(() => {
        let active = true;

        const loadFoundryCatalog = async () => {
            try {
                const client = createFoundryMcpClient();
                const response = await client.fetchStructuredData<Record<string, unknown>>(
                    "components"
                );
                const catalog = normalizeFoundryComponentCatalog(response);

                if (!active || !catalog) {
                    return;
                }

                setFoundryCatalogPrompt(
                    formatFoundryCatalogForPrompt(catalog, {
                        limit: 50,
                        workbenchOnly: true,
                    })
                );
                setFoundryCatalogCount(catalog.componentCount);
            } catch {
                if (!active) {
                    return;
                }
                setFoundryCatalogPrompt(null);
                setFoundryCatalogCount(0);
            }
        };

        void loadFoundryCatalog();

        return () => {
            active = false;
        };
    }, []);

    const researchPrompt = useMemo(() => {
        let prompt = "";

        // Document authoring tools — always included
        prompt += DOCUMENT_AUTHORING_PROMPT;

        if (foundryCatalogPrompt) {
            prompt += `\n\n${foundryCatalogPrompt}\n`;
        }

        if (components.length > 0 || Object.keys(tokenSuggestions).length > 0) {
            prompt += "\n\n# DESIGN DISCOVERY CONTEXT (STAGE1)\n";
            prompt += "Use the following technical discovery data to ground your design decisions.\n\n";

            if (components.length > 0) {
                prompt += "## Discovered Components\n";
                components.forEach((c) => {
                    prompt += `- ${c.name}${c.count ? ` (${c.count} instances)` : ""}\n`;
                });
                prompt += "\n";
            }

            const tokenEntries = Object.entries(tokenSuggestions);
            if (tokenEntries.length > 0) {
                prompt += "## Discovered Style Patterns (Token Suggestions)\n";
                tokenEntries.forEach(([path, value]) => {
                    prompt += `- ${path}: ${value}\n`;
                });
                prompt += "\n";
            }
        }

        return prompt;
    }, [components, tokenSuggestions, foundryCatalogPrompt]);

    const value = useMemo(
        () => ({
            researchPrompt,
            componentCount: components.length,
            tokenCount: Object.keys(tokenSuggestions).length,
            foundryCatalogCount,
        }),
        [researchPrompt, components.length, tokenSuggestions, foundryCatalogCount]
    );

    return (
        <ResearchContext.Provider value={value}>
            {children}
        </ResearchContext.Provider>
    );
};
