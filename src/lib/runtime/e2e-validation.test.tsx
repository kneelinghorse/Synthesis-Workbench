/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ResearchProvider, useResearchContext } from "./ResearchContext";
import { useStage1BundleStore } from "@/lib/stores/stage1-bundle";
import { mapStage1ToOODS } from "./mapping-utils";
import { renderComponent } from "./tools/oods-tools";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { getFoundryMcpClient } from "@/lib/mcp/foundry-client";
import React, { ReactNode } from "react";

vi.mock("@/lib/mcp/foundry-client", () => ({
    getFoundryMcpClient: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
    <ResearchProvider>{children}</ResearchProvider>
);

describe("Synthesis Workbench E2E Pipeline Validation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useStage1BundleStore.getState().reset();
        useDocumentStateStore.getState().reset();
    });

    it("walks through the full pipeline successfully", async () => {
        // 1. Simulate Stage1 Discovery Data Loading
        const mockDiscovery = {
            components: [{ name: "primary-button", count: 1 }],
            tokenSuggestions: { "colors.primary": "#007bff" },
        };

        act(() => {
            useStage1BundleStore.setState({
                components: mockDiscovery.components as any,
                tokenSuggestions: mockDiscovery.tokenSuggestions,
                error: null,
                loadedAt: new Date().toISOString(),
            });
        });

        // 2. Verify Research Context Grounding
        const { result } = renderHook(() => useResearchContext(), { wrapper });
        expect(result.current.researchPrompt).toContain("primary-button");
        expect(result.current.researchPrompt).toContain("colors.primary: #007bff");

        // 3. Simulate Assistant Mapping Logic
        const discoveredComponent = mockDiscovery.components[0];
        const mapped = mapStage1ToOODS(discoveredComponent as any);
        expect(mapped?.component).toBe("Button");
        expect(mapped?.traits.intent).toBe("primary");

        // 4. Simulate Assistant Tool Call (Render)
        const mockRender = vi.fn().mockResolvedValue({
            html: "<button class='oods-btn'>Mapped Button</button>"
        });
        (getFoundryMcpClient as any).mockReturnValue({ render: mockRender });

        const renderResult = await renderComponent({
            requestId: "e2e-test",
            schema: {
                component: mapped?.component,
                traits: { ...mapped?.traits, theme: "modern" }
            },
        });

        // 5. Verify unified document-state update (preview is composed downstream)
        expect(renderResult.rendered).toBe(true);
        expect(renderResult.documentSet).toBe(true);
        expect(useDocumentStateStore.getState().document?.root).toMatchObject({
            nodeType: "component",
            ref: "oods:Button",
        });
    });
});
