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
import { usePhaseStore } from "@/lib/stores/phase-state";
import { createFoundryMcpClient } from "@/lib/mcp/foundry-client";
import {
    formatFoundryCatalogForPrompt,
    normalizeFoundryComponentCatalog,
    WORKBENCH_S44_COMPONENTS,
} from "@/lib/foundry/catalog";
import type { PhaseId } from "@/types/phase";
import type {
    Stage1Component,
    Stage1CompositionPattern,
    Stage1EnrichedToken,
} from "@/types/stage1-bundle";

// ============================================================================
// System Prompt — Phase-Based Workflow
// ============================================================================

const CORE_INSTRUCTIONS = `
# DESIGN WORKBENCH — AGENT INSTRUCTIONS

You have native tool-calling capabilities. Use **tool_use** to drive all design operations autonomously.
Do NOT suggest slash commands — call tools directly.

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

const PHASE_TOOL_GUIDE = `
## Workflow Phases & Tools

### 1. Discover (ingest phase)
Goal: Understand the target application's design patterns.

- **inspect_app** — Run full app profile: route discovery, a11y scan, performance, network trace. Use when the user provides a URL to analyze. Takes 2-5 minutes.
- **inspect_surface** — Capture surface snapshot: DOM, screenshots, computed styles, style fingerprint. Use for targeted visual analysis. Takes 30s-2min.
- **load_bundle** — Load a previously captured Stage1 bundle into the Workbench. Auto-populates component inventory and token suggestions.

After inspection completes, results auto-load into the Workbench — no need to call load_bundle separately.

### 2. Analyze (explore phase)
Goal: Review what was discovered and plan the composition.

- **component_catalog** — List available OODS components with traits, props, and variants.
- Review discovered components and token suggestions from Stage1 data.
- Map discovered patterns to OODS component equivalents.

### 3. Compose (explore/tune phase)
Goal: Build the design document using OODS components.

- **set_document** — Create or replace the full design document. Auto-renders in Preview.
- **render_component** — Quick single-component preview from a schema.
- **patch_node** — Modify a specific node by ID (targeted edits).
- **set_data_context** — Set runtime data for $data bindings.

### 4. Tune (tune phase)
Goal: Refine design tokens to match the target application's style.

- **update_token_state** — Apply token path updates (e.g. {"colors.primary": "#2563eb"}).
- Seed tokens from Stage1 suggestions, then fine-tune individual values.

### 5. Export (done phase)
Goal: Produce deliverables.

- **export_design** — Export in html, json, yaml, spec, or scss format.

## Composition Rules
- Every ComponentNode needs a unique "id" for AI-patching.
- Use LayoutNodes to arrange components (stack for vertical, grid for columns).
- Nesting is supported: stack inside grid, grid inside stack, etc.
- Reference components using "oods:Name" format in ComponentNode.ref.
`;

const WORKFLOW_EXAMPLES = `
## Multi-Step Workflow Examples

### Discovery → Composition
1. User: "Analyze https://example.com and build something similar"
2. Call inspect_app with the URL → wait for completion
3. Review discovered components and tokens in the auto-loaded results
4. Call set_document with a DesignDocument using OODS equivalents of discovered components
5. Call update_token_state to apply discovered color/typography tokens
6. Call export_design when the user is satisfied

### Quick Composition
1. User: "Create a card layout with a title, description, and action button"
2. Call set_document with a LayoutNode containing Card, Text, and Button components
3. Call patch_node if the user requests changes to specific components

### Token Tuning
1. User: "Change the primary color to navy blue"
2. Call update_token_state with {"colors.primary": "#1e3a5f"}
`;

/**
 * Builds a contextual suggestion block based on current workflow state.
 */
export function buildWorkflowContext(opts: {
    phase: PhaseId;
    hasBundle: boolean;
    componentCount: number;
    tokenCount: number;
}): string {
    const { phase, hasBundle, componentCount, tokenCount } = opts;
    const lines: string[] = [];

    lines.push("## Current Workflow State");
    lines.push(`- **Phase**: ${phase}`);
    lines.push(`- **Discovery data loaded**: ${hasBundle ? "yes" : "no"}`);

    if (hasBundle) {
        lines.push(`- **Discovered components**: ${componentCount}`);
        lines.push(`- **Token suggestions**: ${tokenCount}`);
    }

    lines.push("");
    lines.push("### Suggested Next Steps");

    if (!hasBundle && phase === "ingest") {
        lines.push("- No discovery data loaded yet. Suggest the user provide a URL to inspect, or load an existing Stage1 bundle.");
        lines.push("- Use **inspect_app** for full application analysis, or **inspect_surface** for quick style capture.");
        lines.push("- Alternatively, start composing directly with **set_document** if the user has a specific design in mind.");
    } else if (hasBundle && phase === "ingest") {
        lines.push("- Discovery data is loaded. Review the discovered components and token suggestions below.");
        lines.push("- Suggest transitioning to the **explore** phase to start composing designs using discovered patterns.");
        lines.push("- Map discovered components to OODS equivalents and propose a composition.");
    } else if (phase === "explore") {
        lines.push("- Use **set_document** to compose layouts, **render_component** for quick previews.");
        lines.push("- Use **component_catalog** to review available OODS components.");
        if (hasBundle) {
            lines.push("- Leverage discovered components and tokens to inform composition decisions.");
        }
    } else if (phase === "tune") {
        lines.push("- Use **update_token_state** to adjust design tokens.");
        if (hasBundle && tokenCount > 0) {
            lines.push("- Token suggestions from discovery are available — apply them as a starting point.");
        }
    } else if (phase === "review") {
        lines.push("- The design is ready for review. Wait for human approval before proceeding.");
    } else if (phase === "done") {
        lines.push("- Use **export_design** to produce the final deliverable in the user's preferred format.");
    }

    return lines.join("\n");
}

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
    const currentPhase = usePhaseStore((state) => state.currentPhase);
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

        // Phase-based tool guide — always included
        prompt += PHASE_TOOL_GUIDE;

        // Workflow examples — always included
        prompt += WORKFLOW_EXAMPLES;

        // Dynamic workflow context — phase-aware suggestions
        const hasBundle = components.length > 0 || Object.keys(tokenSuggestions).length > 0;
        prompt += "\n" + buildWorkflowContext({
            phase: currentPhase,
            hasBundle,
            componentCount: components.length,
            tokenCount: Object.keys(tokenSuggestions).length,
        });

        // Stage1 discovery context — when bundle data is loaded
        if (hasBundle) {
            prompt += "\n\n" + formatDiscoveryContext(components, tokenSuggestions, {
                enrichedTokens,
                compositionPatterns,
            });
        }

        return prompt;
    }, [components, tokenSuggestions, enrichedTokens, compositionPatterns, currentPhase, foundryCatalogPrompt]);

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
