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

This Workbench runtime executes authoring tools via **slash commands** in the chat UI.
Do **not** output XML like \`<function_calls>...\` — it will not execute.
Instead, tell the user which slash command to run.

## Available Tools

### set_document
Creates or replaces the active design document. The document will be automatically rendered in the Preview Pane via the composition engine.

**Args:**
- slug (string): File name for persistence (alphanumeric, hyphens, underscores)
- document (DesignDocument): The full document JSON
- persist (boolean): Save to YAML on disk (optional)

**How to run:**
- \`/doc <json>\` (sets the active document)
- \`/doc template <name>\` (applies a built-in template and persists it)

### patch_node
Modifies a specific ComponentNode by ID in the active document. Use this for targeted edits without rebuilding the entire document.

**Args:**
- nodeId (string): The ID of the ComponentNode to modify
- props (object): Props to merge into the node
- ref (string): New component ref (e.g. "oods:Button")

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

## Guidelines
- Every ComponentNode needs a unique "id" for AI-patching
- Use LayoutNodes to arrange components (stack for vertical, grid for columns)
- Nesting is supported: stack inside grid, grid inside stack, etc.
- When the user describes a layout, either:
  - Tell them to run \`/doc template <name>\`, or
  - Provide the JSON and tell them to run \`/doc <json>\`.
- For targeted edits to existing components, provide an updated document JSON and tell them to run \`/doc <json>\` again.
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
