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
import type {
    Stage1Component,
    Stage1CompositionPattern,
    Stage1EnrichedToken,
} from "@/types/stage1-bundle";

// ============================================================================
// System Prompt — Static Review Surface
// ============================================================================

const CORE_INSTRUCTIONS = `
# DESIGN WORKBENCH — AGENT INSTRUCTIONS

This workbench is the human review-and-iterate surface for designs produced by headless OODS Forge.
Your job is to help the human REVIEW the rendered preview and refine it — not to build a design autonomously.

Work in a review → comment → suggest → confirm loop:
1. **Review** the current preview and the human's critique of it.
2. **Comment** — pin specific, actionable observations to the element under discussion.
3. **Suggest** a concrete change: name the node/prop/token and the exact new value.
4. **Confirm** — wait for the human to approve before you apply anything.

Only after the human confirms, use **tool_use** to apply the change (e.g. set_document, patch_node).
Do not mutate the document before the human agrees, and do not treat your own suggestion as approval.

## Document Model

A DesignDocument has this structure:
\`\`\`json
{
  "metadata": { "title": "My Design", "description": "..." },
  "root": <DesignNode>
}
\`\`\`

**ComponentNode** — References an OODS component:
\`\`\`json
{ "nodeType": "component", "id": "unique-id", "ref": "oods:ComponentName", "props": { ... } }
\`\`\`

**LayoutNode** — Arranges children in stack (vertical) or grid:
\`\`\`json
{ "nodeType": "layout", "layout": { "type": "stack", "gap": 16, "align": "center" }, "children": [ ... ] }
{ "nodeType": "layout", "layout": { "type": "grid", "columns": 3, "gap": 16 }, "children": [ ... ] }
\`\`\`
`;

/**
 * Formats discovered Stage1 components with richer metadata.
 */
export type FormatDiscoveryOptions = {
    enrichedTokens?: Record<string, Stage1EnrichedToken>;
    compositionPatterns?: Stage1CompositionPattern[];
};

export function formatDiscoveryContext(
    components: Stage1Component[],
    tokenSuggestions: Record<string, string>,
    options?: FormatDiscoveryOptions
): string {
    const lines: string[] = [];
    const enrichedTokens = options?.enrichedTokens ?? {};
    const compositionPatterns = options?.compositionPatterns ?? [];

    lines.push("# DESIGN DISCOVERY CONTEXT (STAGE1)");
    lines.push("Use the following discovery data to ground your design decisions.");
    lines.push("Map discovered components to OODS equivalents when composing.");
    lines.push("");

    if (components.length > 0) {
        lines.push("## Discovered Components");
        for (const c of components) {
            let entry = `- **${c.name}**`;
            if (c.count) entry += ` (${c.count} instances)`;
            if (c.confidence != null) entry += ` [confidence: ${(c.confidence * 100).toFixed(0)}%]`;
            lines.push(entry);

            if (c.variants && c.variants.length > 0) {
                lines.push(`  variants: ${c.variants.join(", ")}`);
            }
            if (c.selectors?.css) {
                lines.push(`  selector: ${c.selectors.css}`);
            }
            if (c.props && c.props.length > 0) {
                const propDescs = c.props.map((p) => {
                    let desc = p.name;
                    if (p.type) desc += `: ${p.type}`;
                    if (p.values && p.values.length > 0) desc += ` (${p.values.join(" | ")})`;
                    if (p.required) desc += " *required*";
                    return desc;
                });
                lines.push(`  props: ${propDescs.join(", ")}`);
            }
        }
        lines.push("");
    }

    const tokenEntries = Object.entries(tokenSuggestions);
    if (tokenEntries.length > 0) {
        lines.push("## Discovered Style Patterns (Token Suggestions)");
        lines.push("Apply these with update_token_state to match the target application's visual style.");
        lines.push("");

        // Group tokens by category
        const groups: Record<string, [string, string][]> = {};
        for (const [path, value] of tokenEntries) {
            const category = path.split(".")[0] ?? "other";
            if (!groups[category]) groups[category] = [];
            groups[category].push([path, value]);
        }

        for (const [category, entries] of Object.entries(groups)) {
            lines.push(`### ${category}`);
            for (const [path, value] of entries) {
                const enriched = enrichedTokens[path];
                if (enriched && (enriched.confidence != null || enriched.occurrences != null)) {
                    const meta: string[] = [];
                    if (enriched.confidence != null) meta.push(`confidence: ${(enriched.confidence * 100).toFixed(0)}%`);
                    if (enriched.occurrences != null) meta.push(`${enriched.occurrences} occurrences`);
                    lines.push(`- ${path}: ${value} [${meta.join(", ")}]`);
                } else {
                    lines.push(`- ${path}: ${value}`);
                }
            }
            lines.push("");
        }
    }

    if (compositionPatterns.length > 0) {
        lines.push("## Composition Patterns");
        lines.push("Common component arrangements detected in the target application.");
        lines.push("");
        for (const pattern of compositionPatterns) {
            let entry = `- **${pattern.name}**: ${pattern.components.join(" → ")}`;
            if (pattern.frequency != null) entry += ` (${pattern.frequency}x)`;
            if (pattern.confidence != null) entry += ` [confidence: ${(pattern.confidence * 100).toFixed(0)}%]`;
            lines.push(entry);
            if (pattern.description) {
                lines.push(`  ${pattern.description}`);
            }
        }
        lines.push("");
    }

    return lines.join("\n");
}

// ============================================================================
// Context Provider
// ============================================================================

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
    const enrichedTokens = useStage1BundleStore((state) => state.enrichedTokens);
    const compositionPatterns = useStage1BundleStore((state) => state.compositionPatterns);
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

        // Core instructions — always included
        prompt += CORE_INSTRUCTIONS;

        // Component catalog reference
        prompt += `\n## OODS Component Catalog\nAvailable refs: ${WORKBENCH_S44_COMPONENTS.map((name) => `oods:${name}`).join(", ")}\n`;

        if (foundryCatalogPrompt) {
            prompt += `\n${foundryCatalogPrompt}\n`;
        }

        // Stage1 discovery context — when bundle data is loaded
        const hasBundle = components.length > 0 || Object.keys(tokenSuggestions).length > 0;
        if (hasBundle) {
            prompt += "\n\n" + formatDiscoveryContext(components, tokenSuggestions, {
                enrichedTokens,
                compositionPatterns,
            });
        }

        return prompt;
    }, [components, tokenSuggestions, enrichedTokens, compositionPatterns, foundryCatalogPrompt]);

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
