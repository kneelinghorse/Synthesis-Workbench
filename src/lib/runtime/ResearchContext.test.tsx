/* @vitest-environment jsdom */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    ResearchProvider,
    useResearchContext,
    buildWorkflowContext,
    formatDiscoveryContext,
} from "./ResearchContext";
import { useStage1BundleStore } from "@/lib/stores/stage1-bundle";
import { usePhaseStore } from "@/lib/stores/phase-state";
import { createFoundryMcpClient } from "@/lib/mcp/foundry-client";
import React, { ReactNode } from "react";

vi.mock("@/lib/stores/stage1-bundle", () => ({
    useStage1BundleStore: vi.fn(),
}));

vi.mock("@/lib/stores/phase-state", () => ({
    usePhaseStore: vi.fn(),
}));

vi.mock("@/lib/mcp/foundry-client", () => ({
    createFoundryMcpClient: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
    <ResearchProvider>{children}</ResearchProvider>
);

describe("ResearchContext", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (createFoundryMcpClient as ReturnType<typeof vi.fn>).mockImplementation(() => {
            throw new Error("Foundry unavailable");
        });
        (usePhaseStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { currentPhase: string }) => string) =>
                selector({ currentPhase: "ingest" })
        );
    });

    // ─── Core prompt structure ────────────────────────────────────

    it("includes phase-based workflow sections in prompt", () => {
        (useStage1BundleStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { components: unknown[]; tokenSuggestions: Record<string, string> }) => unknown) =>
                selector({ components: [], tokenSuggestions: {} })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("DESIGN WORKBENCH");
        expect(result.current.researchPrompt).toContain("Workflow Phases & Tools");
        expect(result.current.researchPrompt).toContain("1. Discover");
        expect(result.current.researchPrompt).toContain("2. Analyze");
        expect(result.current.researchPrompt).toContain("3. Compose");
        expect(result.current.researchPrompt).toContain("4. Tune");
        expect(result.current.researchPrompt).toContain("5. Export");
    });

    it("includes workflow examples in prompt", () => {
        (useStage1BundleStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { components: unknown[]; tokenSuggestions: Record<string, string> }) => unknown) =>
                selector({ components: [], tokenSuggestions: {} })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("Multi-Step Workflow Examples");
        expect(result.current.researchPrompt).toContain("Discovery → Composition");
    });

    it("includes document model reference", () => {
        (useStage1BundleStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { components: unknown[]; tokenSuggestions: Record<string, string> }) => unknown) =>
                selector({ components: [], tokenSuggestions: {} })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("Document Model");
        expect(result.current.researchPrompt).toContain("ComponentNode");
        expect(result.current.researchPrompt).toContain("LayoutNode");
    });

    // ─── No bundle loaded (discovery suggestions) ─────────────────

    it("suggests inspection tools when no Stage1 data is present", () => {
        (useStage1BundleStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { components: unknown[]; tokenSuggestions: Record<string, string> }) => unknown) =>
                selector({ components: [], tokenSuggestions: {} })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("No discovery data loaded");
        expect(result.current.researchPrompt).toContain("inspect_app");
        expect(result.current.researchPrompt).not.toContain("DESIGN DISCOVERY CONTEXT");
        expect(result.current.componentCount).toBe(0);
        expect(result.current.tokenCount).toBe(0);
    });

    // ─── Bundle loaded (discovery context) ────────────────────────

    it("includes discovery context when Stage1 data is present", () => {
        (useStage1BundleStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { components: { name: string; count: number }[]; tokenSuggestions: Record<string, string> }) => unknown) =>
                selector({
                    components: [{ name: "Primary Button", count: 5 }],
                    tokenSuggestions: { "colors.primary": "#007bff" },
                })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("DESIGN DISCOVERY CONTEXT (STAGE1)");
        expect(result.current.researchPrompt).toContain("**Primary Button**");
        expect(result.current.researchPrompt).toContain("5 instances");
        expect(result.current.researchPrompt).toContain("colors.primary: #007bff");
        expect(result.current.componentCount).toBe(1);
        expect(result.current.tokenCount).toBe(1);
    });

    it("includes component confidence and variants in discovery context", () => {
        (useStage1BundleStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { components: unknown[]; tokenSuggestions: Record<string, string> }) => unknown) =>
                selector({
                    components: [
                        {
                            name: "NavBar",
                            count: 3,
                            confidence: 0.85,
                            variants: ["horizontal", "vertical"],
                            selectors: { css: ".navbar" },
                        },
                    ],
                    tokenSuggestions: {},
                })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("**NavBar**");
        expect(result.current.researchPrompt).toContain("confidence: 85%");
        expect(result.current.researchPrompt).toContain("variants: horizontal, vertical");
        expect(result.current.researchPrompt).toContain("selector: .navbar");
    });

    it("groups token suggestions by category", () => {
        (useStage1BundleStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { components: unknown[]; tokenSuggestions: Record<string, string> }) => unknown) =>
                selector({
                    components: [{ name: "Button" }],
                    tokenSuggestions: {
                        "colors.primary": "#007bff",
                        "colors.secondary": "#6c757d",
                        "typography.fontFamily.sans": "Inter",
                        "spacing.md": "16px",
                    },
                })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("### colors");
        expect(result.current.researchPrompt).toContain("### typography");
        expect(result.current.researchPrompt).toContain("### spacing");
    });

    // ─── Phase-aware context ──────────────────────────────────────

    it("provides phase-specific suggestions for explore phase", () => {
        (useStage1BundleStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { components: unknown[]; tokenSuggestions: Record<string, string> }) => unknown) =>
                selector({ components: [], tokenSuggestions: {} })
        );
        (usePhaseStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { currentPhase: string }) => string) =>
                selector({ currentPhase: "explore" })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("Phase**: explore");
        expect(result.current.researchPrompt).toContain("set_document");
    });

    it("provides phase-specific suggestions for done phase", () => {
        (useStage1BundleStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { components: unknown[]; tokenSuggestions: Record<string, string> }) => unknown) =>
                selector({ components: [], tokenSuggestions: {} })
        );
        (usePhaseStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { currentPhase: string }) => string) =>
                selector({ currentPhase: "done" })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("Phase**: done");
        expect(result.current.researchPrompt).toContain("export_design");
    });

    it("suggests bundle-aware actions when data is loaded in ingest phase", () => {
        (useStage1BundleStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { components: { name: string }[]; tokenSuggestions: Record<string, string> }) => unknown) =>
                selector({
                    components: [{ name: "Card" }],
                    tokenSuggestions: { "colors.primary": "#000" },
                })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("Discovery data is loaded");
        expect(result.current.researchPrompt).toContain("explore");
    });

    // ─── Foundry catalog ──────────────────────────────────────────

    it("injects Foundry component catalog metadata into the prompt", async () => {
        (useStage1BundleStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { components: unknown[]; tokenSuggestions: Record<string, string> }) => unknown) =>
                selector({ components: [], tokenSuggestions: {} })
        );
        (createFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue({
            fetchStructuredData: vi.fn().mockResolvedValue({
                dataset: "components",
                version: "2025-12-19",
                generatedAt: "2025-12-19T00:00:00Z",
                etag: "abc123",
                matched: false,
                payloadIncluded: true,
                path: "cmos/planning/oods-components.json",
                manifestPath: null,
                sizeBytes: 100,
                schemaValidated: true,
                payload: {
                    components: [
                        {
                            id: "Button",
                            displayName: "Button",
                            contexts: ["detail"],
                            regions: ["card"],
                            traitUsages: [
                                {
                                    trait: "Actionable",
                                    context: "detail",
                                    props: {
                                        label: "Save",
                                    },
                                },
                            ],
                        },
                    ],
                },
                raw: {},
            }),
        });

        const { result } = renderHook(() => useResearchContext(), { wrapper });

        await waitFor(() => {
            expect(result.current.researchPrompt).toContain(
                "OODS COMPONENT CATALOG (FOUNDRY)"
            );
        });

        expect(result.current.researchPrompt).toContain("oods:Button");
        expect(result.current.researchPrompt).toContain("traits: Actionable");
        expect(result.current.researchPrompt).toContain(
            "required props: label"
        );
        expect(result.current.foundryCatalogCount).toBe(1);
    });

    // ─── OODS component refs ──────────────────────────────────────

    it("lists available OODS component refs", () => {
        (useStage1BundleStore as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (state: { components: unknown[]; tokenSuggestions: Record<string, string> }) => unknown) =>
                selector({ components: [], tokenSuggestions: {} })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("oods:Button");
        expect(result.current.researchPrompt).toContain("oods:Card");
        expect(result.current.researchPrompt).toContain("oods:Stack");
    });
});

// ─── Pure function unit tests ─────────────────────────────────

describe("buildWorkflowContext", () => {
    it("suggests inspection tools when no bundle in ingest phase", () => {
        const result = buildWorkflowContext({
            phase: "ingest",
            hasBundle: false,
            componentCount: 0,
            tokenCount: 0,
        });

        expect(result).toContain("No discovery data loaded");
        expect(result).toContain("inspect_app");
        expect(result).toContain("inspect_surface");
    });

    it("suggests transitioning to explore when bundle is loaded in ingest", () => {
        const result = buildWorkflowContext({
            phase: "ingest",
            hasBundle: true,
            componentCount: 5,
            tokenCount: 10,
        });

        expect(result).toContain("Discovery data is loaded");
        expect(result).toContain("explore");
        expect(result).toContain("Discovered components**: 5");
        expect(result).toContain("Token suggestions**: 10");
    });

    it("suggests composition tools in explore phase", () => {
        const result = buildWorkflowContext({
            phase: "explore",
            hasBundle: true,
            componentCount: 3,
            tokenCount: 5,
        });

        expect(result).toContain("set_document");
        expect(result).toContain("component_catalog");
        expect(result).toContain("Leverage discovered");
    });

    it("suggests token tuning in tune phase with bundle", () => {
        const result = buildWorkflowContext({
            phase: "tune",
            hasBundle: true,
            componentCount: 3,
            tokenCount: 5,
        });

        expect(result).toContain("update_token_state");
        expect(result).toContain("Token suggestions from discovery");
    });

    it("suggests export in done phase", () => {
        const result = buildWorkflowContext({
            phase: "done",
            hasBundle: false,
            componentCount: 0,
            tokenCount: 0,
        });

        expect(result).toContain("export_design");
    });

    it("suggests waiting for review in review phase", () => {
        const result = buildWorkflowContext({
            phase: "review",
            hasBundle: false,
            componentCount: 0,
            tokenCount: 0,
        });

        expect(result).toContain("review");
        expect(result).toContain("human approval");
    });
});

describe("formatDiscoveryContext", () => {
    it("formats components with name, count, confidence, variants, selectors", () => {
        const result = formatDiscoveryContext(
            [
                {
                    name: "NavBar",
                    count: 3,
                    confidence: 0.92,
                    variants: ["horizontal", "vertical"],
                    selectors: { css: ".nav-bar" },
                },
                {
                    name: "Footer",
                    count: 1,
                },
            ],
            {}
        );

        expect(result).toContain("**NavBar**");
        expect(result).toContain("3 instances");
        expect(result).toContain("confidence: 92%");
        expect(result).toContain("variants: horizontal, vertical");
        expect(result).toContain("selector: .nav-bar");
        expect(result).toContain("**Footer**");
        expect(result).toContain("1 instances");
    });

    it("formats token suggestions grouped by category", () => {
        const result = formatDiscoveryContext([], {
            "colors.primary": "#007bff",
            "colors.secondary": "#6c757d",
            "typography.fontFamily.sans": "Inter",
            "spacing.md": "16px",
        });

        expect(result).toContain("### colors");
        expect(result).toContain("colors.primary: #007bff");
        expect(result).toContain("colors.secondary: #6c757d");
        expect(result).toContain("### typography");
        expect(result).toContain("typography.fontFamily.sans: Inter");
        expect(result).toContain("### spacing");
        expect(result).toContain("spacing.md: 16px");
    });

    it("returns header even with empty data", () => {
        const result = formatDiscoveryContext([], {});
        expect(result).toContain("DESIGN DISCOVERY CONTEXT");
        expect(result).not.toContain("## Discovered Components");
        expect(result).not.toContain("## Discovered Style Patterns");
    });

    it("includes guidance to map components to OODS equivalents", () => {
        const result = formatDiscoveryContext(
            [{ name: "CustomButton", count: 5 }],
            {}
        );
        expect(result).toContain("Map discovered components to OODS equivalents");
    });

    it("includes guidance to apply tokens with update_token_state", () => {
        const result = formatDiscoveryContext(
            [],
            { "colors.primary": "#007bff" }
        );
        expect(result).toContain("update_token_state");
    });

    // ─── Enriched tokens ─────────────────────────────────────────

    it("renders enriched token confidence and occurrences", () => {
        const result = formatDiscoveryContext(
            [],
            { "colors.primary": "#3b82f6", "colors.secondary": "#6c757d" },
            {
                enrichedTokens: {
                    "colors.primary": {
                        value: "#3b82f6",
                        confidence: 0.95,
                        occurrences: 42,
                    },
                    "colors.secondary": {
                        value: "#6c757d",
                        confidence: 0.7,
                    },
                },
            }
        );

        expect(result).toContain("colors.primary: #3b82f6 [confidence: 95%, 42 occurrences]");
        expect(result).toContain("colors.secondary: #6c757d [confidence: 70%]");
    });

    it("renders plain tokens when enriched data has no confidence or occurrences", () => {
        const result = formatDiscoveryContext(
            [],
            { "spacing.md": "16px" },
            {
                enrichedTokens: {
                    "spacing.md": { value: "16px" },
                },
            }
        );

        // No brackets — just the plain format
        expect(result).toContain("spacing.md: 16px");
        expect(result).not.toContain("[");
    });

    // ─── Component props ─────────────────────────────────────────

    it("renders component prop signatures", () => {
        const result = formatDiscoveryContext(
            [
                {
                    name: "Button",
                    count: 12,
                    props: [
                        { name: "variant", type: "string", values: ["primary", "secondary"] },
                        { name: "size", type: "string", values: ["sm", "md", "lg"] },
                        { name: "label", type: "string", required: true },
                    ],
                },
            ],
            {}
        );

        expect(result).toContain("**Button**");
        expect(result).toContain("props:");
        expect(result).toContain("variant: string (primary | secondary)");
        expect(result).toContain("size: string (sm | md | lg)");
        expect(result).toContain("label: string *required*");
    });

    it("omits props line when component has no props", () => {
        const result = formatDiscoveryContext(
            [{ name: "Divider", count: 3 }],
            {}
        );

        expect(result).toContain("**Divider**");
        expect(result).not.toContain("props:");
    });

    // ─── Composition patterns ────────────────────────────────────

    it("renders composition patterns with frequency and confidence", () => {
        const result = formatDiscoveryContext([], {}, {
            compositionPatterns: [
                {
                    name: "Card with Action",
                    components: ["Card", "CardHeader", "Button"],
                    frequency: 8,
                    confidence: 0.87,
                    description: "Action card used in dashboard grids",
                },
            ],
        });

        expect(result).toContain("## Composition Patterns");
        expect(result).toContain("**Card with Action**: Card → CardHeader → Button");
        expect(result).toContain("(8x)");
        expect(result).toContain("[confidence: 87%]");
        expect(result).toContain("Action card used in dashboard grids");
    });

    it("renders minimal composition patterns without optional fields", () => {
        const result = formatDiscoveryContext([], {}, {
            compositionPatterns: [
                {
                    name: "Simple Stack",
                    components: ["Header", "Content", "Footer"],
                },
            ],
        });

        expect(result).toContain("**Simple Stack**: Header → Content → Footer");
        expect(result).not.toContain("(x)");
        expect(result).not.toContain("[confidence:");
    });

    it("omits composition patterns section when array is empty", () => {
        const result = formatDiscoveryContext([], {}, {
            compositionPatterns: [],
        });

        expect(result).not.toContain("## Composition Patterns");
    });

    // ─── Backward compatibility ──────────────────────────────────

    it("produces identical output for old bundles without enriched options", () => {
        const withoutOptions = formatDiscoveryContext(
            [{ name: "Card", count: 5 }],
            { "colors.primary": "#000" }
        );
        const withEmptyOptions = formatDiscoveryContext(
            [{ name: "Card", count: 5 }],
            { "colors.primary": "#000" },
            { enrichedTokens: {}, compositionPatterns: [] }
        );

        expect(withoutOptions).toBe(withEmptyOptions);
    });
});
