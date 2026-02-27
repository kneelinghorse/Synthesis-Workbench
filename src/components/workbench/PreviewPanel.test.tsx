/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewPanel } from "./PreviewPanel";
import { getFoundryMcpClient } from "@/lib/mcp/foundry-client";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import { useTokenStateStore } from "@/lib/stores/token-state";
import type { DesignDocument } from "@/types/document-model";

vi.mock("@/hooks/useCompositionPreview", () => ({
  useCompositionPreview: vi.fn(),
}));

vi.mock("@/lib/mcp/foundry-client", () => ({
  getFoundryMcpClient: vi.fn(() => null),
}));

vi.mock("@/components/workbench/PreviewPane", () => ({
  PreviewPane: ({
    html,
    reloadNonce,
  }: {
    html?: string;
    reloadNonce?: number;
  }) => (
    <div data-testid="preview-pane" data-reload-nonce={String(reloadNonce ?? "")}>
      {html}
    </div>
  ),
}));

const SAMPLE_DOC: DesignDocument = {
  metadata: { title: "Preview Panel Error Actions" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 16 },
    children: [
      {
        nodeType: "component",
        id: "failed-1",
        ref: "oods:Failing",
        props: {},
      },
      {
        nodeType: "component",
        id: "ok-1",
        ref: "oods:Healthy",
        props: {},
      },
    ],
  },
};

const ORIGINAL_FOUNDRY_ENDPOINT =
  process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;
const ORIGINAL_SERVER_FOUNDRY_ENDPOINT =
  process.env.OODS_FOUNDRY_MCP_URL;

describe("PreviewPanel error actions", () => {
  afterEach(() => {
    if (typeof ORIGINAL_FOUNDRY_ENDPOINT === "undefined") {
      delete process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;
    } else {
      process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL = ORIGINAL_FOUNDRY_ENDPOINT;
    }
    if (typeof ORIGINAL_SERVER_FOUNDRY_ENDPOINT === "undefined") {
      delete process.env.OODS_FOUNDRY_MCP_URL;
    } else {
      process.env.OODS_FOUNDRY_MCP_URL = ORIGINAL_SERVER_FOUNDRY_ENDPOINT;
    }
    cleanup();
  });

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;
    vi.mocked(getFoundryMcpClient).mockReset();
    vi.mocked(getFoundryMcpClient).mockReturnValue(null as any);
    useDocumentStateStore.getState().reset();
    usePreviewStateStore.getState().reset();
    useTokenStateStore.getState().resetAll();

    useDocumentStateStore.getState().setDocument(SAMPLE_DOC);
    useDocumentStateStore.getState().setCompositionState("error", [
      {
        componentId: "failed-1",
        componentRef: "oods:Failing",
        message: "Render failed",
      },
    ]);
    usePreviewStateStore.getState().setHtml("<div>partial render</div>");
  });

  it("shows retry/skip controls and wires them to document actions", () => {
    render(<PreviewPanel />);

    // New CompositionErrorOverlay shows ref and message in separate elements
    expect(screen.getByText("oods:Failing")).toBeTruthy();
    expect(screen.getByText("Render failed")).toBeTruthy();
    expect(screen.getByText("Skip")).toBeTruthy();
    expect(screen.getByText("Retry All")).toBeTruthy();

    const retryNonceBefore = useDocumentStateStore.getState().retryNonce;
    // Click the per-error Retry button (not "Retry All")
    const retryButtons = screen.getAllByText("Retry");
    fireEvent.click(retryButtons[retryButtons.length - 1]);
    expect(useDocumentStateStore.getState().retryNonce).toBe(retryNonceBefore + 1);

    fireEvent.click(screen.getByText("Skip"));
    const root = useDocumentStateStore.getState().document?.root;
    expect(root?.nodeType).toBe("layout");
    if (root?.nodeType === "layout") {
      const componentIds = root.children
        .filter((child): child is Extract<typeof child, { nodeType: "component" }> => child.nodeType === "component")
        .map((child) => child.id);
      expect(componentIds).toContain("ok-1");
      expect(componentIds).not.toContain("failed-1");
    }
  });

  it("switches preview theme and loads theme-specific Foundry tokens", async () => {
    process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL = "http://foundry.test/run";

    const buildTokens = vi
      .fn()
      .mockResolvedValueOnce({
        tokens: { "colors.primary": "#111111" },
        raw: {},
      })
      .mockResolvedValueOnce({
        tokens: { "colors.primary": "#222222" },
        raw: {},
      });

    vi.mocked(getFoundryMcpClient).mockReturnValue({
      buildTokens,
      render: vi.fn(),
      validate: vi.fn(),
      fetchStructuredData: vi.fn(),
    } as any);

    render(<PreviewPanel />);

    await waitFor(() => {
      expect(buildTokens).toHaveBeenCalledTimes(1);
    });
    expect(usePreviewStateStore.getState().theme).toBe("base");
    expect(useTokenStateStore.getState().tokens.colors.primary).toBe("#111111");

    fireEvent.change(screen.getByLabelText("Theme"), {
      target: { value: "dark" },
    });

    await waitFor(() => {
      expect(buildTokens).toHaveBeenCalledTimes(2);
    });
    expect(usePreviewStateStore.getState().theme).toBe("dark");
    expect(useTokenStateStore.getState().tokens.colors.primary).toBe("#222222");
  });

  it("uses OODS_FOUNDRY_MCP_URL fallback when NEXT_PUBLIC endpoint is unset", async () => {
    delete process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;
    process.env.OODS_FOUNDRY_MCP_URL = "http://foundry.test/run";

    const buildTokens = vi.fn().mockResolvedValue({
      tokens: { "colors.primary": "#00aa00" },
      raw: {},
    });

    vi.mocked(getFoundryMcpClient).mockReturnValue({
      buildTokens,
      render: vi.fn(),
      validate: vi.fn(),
      fetchStructuredData: vi.fn(),
    } as any);

    render(<PreviewPanel />);

    await waitFor(() => {
      expect(buildTokens).toHaveBeenCalledTimes(1);
    });
    expect(useTokenStateStore.getState().tokens.colors.primary).toBe("#00aa00");
  });

  it("reloads the preview iframe bridge when requested", () => {
    render(<PreviewPanel />);

    const getLatestReloadNonce = () => {
      const panes = screen.getAllByTestId("preview-pane");
      return panes[panes.length - 1]?.dataset.reloadNonce;
    };

    expect(getLatestReloadNonce()).toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "Reload Preview" }));

    expect(getLatestReloadNonce()).toBe("1");
  });

  it("shows retry button on theme sync failure and re-triggers loadThemeTokens on click", async () => {
    process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL = "http://foundry.test/run";

    const buildTokens = vi
      .fn()
      // First attempt: all three candidates (light, base, default) fail.
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockRejectedValueOnce(new Error("connection refused"))
      // Retry: first candidate succeeds.
      .mockResolvedValueOnce({
        tokens: { "colors.primary": "#333333" },
        raw: {},
      });

    vi.mocked(getFoundryMcpClient).mockReturnValue({
      buildTokens,
      render: vi.fn(),
      validate: vi.fn(),
      fetchStructuredData: vi.fn(),
    } as any);

    render(<PreviewPanel />);

    await waitFor(() => {
      expect(screen.getByText("Theme sync failed")).toBeTruthy();
    });

    // All three candidates fail (light, base, default).
    expect(buildTokens).toHaveBeenCalledTimes(3);

    // Find the Retry button associated with theme sync (there may be composition Retry too).
    const retryButtons = screen.getAllByRole("button", { name: "Retry" });
    const themeSyncRetry = retryButtons.find((btn) =>
      btn.closest("span")?.textContent?.includes("Theme sync failed")
    );
    expect(themeSyncRetry).toBeTruthy();

    fireEvent.click(themeSyncRetry!);

    await waitFor(() => {
      expect(buildTokens).toHaveBeenCalledTimes(4);
    });

    await waitFor(() => {
      expect(useTokenStateStore.getState().tokens.colors.primary).toBe("#333333");
    });
  });

  it("shows offline static preview indicators when Foundry is unavailable", () => {
    vi.mocked(getFoundryMcpClient).mockReturnValue(null as any);
    render(<PreviewPanel />);

    expect(screen.getByText("Offline (Static)")).toBeTruthy();
    expect(
      screen.getByText(
        "Foundry MCP is unavailable. Static Preview mode is active and theme token sync is disabled."
      )
    ).toBeTruthy();
  });

  it("suppresses canonical token warning when preview transitions to live mode", async () => {
    process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL = "http://foundry.test/run";

    const buildTokens = vi.fn().mockResolvedValue({
      tokens: {},
      raw: {},
    });

    vi.mocked(getFoundryMcpClient).mockReturnValue({
      buildTokens,
      render: vi.fn(),
      validate: vi.fn(),
      fetchStructuredData: vi.fn(),
    } as any);

    render(<PreviewPanel />);

    await waitFor(() => {
      expect(buildTokens).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByText(
        "Foundry did not return canonical tokens for this theme (skipping sync)."
      )
    ).toBeTruthy();

    usePreviewStateStore.getState().setFoundryStatus("live");
    await waitFor(() => {
      expect(screen.getByText("Live Render")).toBeTruthy();
    });

    await waitFor(() => {
      expect(
        screen.queryByText(
          "Foundry did not return canonical tokens for this theme (skipping sync)."
        )
      ).toBeNull();
    });
  });

  it("shows canonical token warning when preview is not live (fallback mode)", async () => {
    process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL = "http://foundry.test/run";

    const buildTokens = vi.fn().mockResolvedValue({
      tokens: {},
      raw: {},
    });

    vi.mocked(getFoundryMcpClient).mockReturnValue({
      buildTokens,
      render: vi.fn(),
      validate: vi.fn(),
      fetchStructuredData: vi.fn(),
    } as any);

    usePreviewStateStore.getState().setFoundryStatus("dry-run");

    render(<PreviewPanel />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Foundry did not return canonical tokens for this theme (skipping sync)."
        )
      ).toBeTruthy();
    });
  });

  it("shows offline empty state when Foundry is offline and no document is loaded", () => {
    vi.mocked(getFoundryMcpClient).mockReturnValue(null as any);
    useDocumentStateStore.getState().reset();
    usePreviewStateStore.getState().reset();

    render(<PreviewPanel />);

    expect(screen.getByText("No design loaded")).toBeTruthy();
    expect(
      screen.getByText(/Load a design document or use the chat/)
    ).toBeTruthy();
  });
});
