/* @vitest-environment jsdom */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResearchProvider, useResearchContext } from "./ResearchContext";
import { useStage1BundleStore } from "@/lib/stores/stage1-bundle";
import { createFoundryMcpClient } from "@/lib/mcp/foundry-client";
import React, { ReactNode } from "react";

vi.mock("@/lib/stores/stage1-bundle", () => ({
    useStage1BundleStore: vi.fn(),
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
        (createFoundryMcpClient as any).mockImplementation(() => {
            throw new Error("Foundry unavailable");
        });
    });

    it("includes document authoring prompt even when no Stage1 data is present", () => {
        (useStage1BundleStore as any).mockImplementation((selector: any) =>
            selector({ components: [], tokenSuggestions: {} })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("DOCUMENT AUTHORING");
        expect(result.current.researchPrompt).not.toContain("DESIGN DISCOVERY CONTEXT");
        expect(result.current.componentCount).toBe(0);
        expect(result.current.tokenCount).toBe(0);
        expect(result.current.foundryCatalogCount).toBe(0);
    });

    it("generates a formatted prompt when data is present", () => {
        (useStage1BundleStore as any).mockImplementation((selector: any) =>
            selector({
                components: [{ name: "Primary Button", count: 5 }],
                tokenSuggestions: { "colors.primary": "#007bff" },
            })
        );

        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("# DESIGN DISCOVERY CONTEXT (STAGE1)");
        expect(result.current.researchPrompt).toContain("Primary Button (5 instances)");
        expect(result.current.researchPrompt).toContain("colors.primary: #007bff");
        expect(result.current.foundryCatalogCount).toBe(0);
    });

    it("injects Foundry component catalog metadata into the prompt", async () => {
        (useStage1BundleStore as any).mockImplementation((selector: any) =>
            selector({ components: [], tokenSuggestions: {} })
        );
        (createFoundryMcpClient as any).mockReturnValue({
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
});
