/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProjectBrowser } from "./ProjectBrowser";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { useProjectStateStore } from "@/lib/stores/project-state";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import { resetTokenState, useTokenStateStore } from "@/lib/stores/token-state";
import { resetStage1BundleStore } from "@/lib/stores/stage1-bundle";
import { useDataContextStore } from "@/lib/stores/data-context";

const PROJECT_LIST = {
  projects: [
    {
      slug: "alpha",
      name: "Alpha",
      designCount: 1,
      updatedAt: "2026-02-15T00:00:00.000Z",
      lastModifiedAt: "2026-02-15T00:00:00.000Z",
    },
    {
      slug: "beta",
      name: "Beta",
      designCount: 0,
      updatedAt: "2026-02-14T00:00:00.000Z",
      lastModifiedAt: "2026-02-14T00:00:00.000Z",
    },
  ],
  count: 2,
};

const WORKSPACE_ALPHA = {
  project: PROJECT_LIST.projects[0],
  workspace: {
    activeDesignSlug: "home",
    workspace: {
      document: {
        metadata: { title: "Alpha Home" },
        root: {
          nodeType: "layout",
          layout: { type: "stack", gap: 8 },
          children: [],
        },
      },
      dataContext: {},
      tokenState: {
        values: {
          colors: {
            primary: "#3b82f6",
            secondary: "#64748b",
            accent: "#f59e0b",
            background: "#ffffff",
            surface: "#f8fafc",
            text: { primary: "#0f172a", secondary: "#475569", disabled: "#94a3b8" },
            status: {
              success: "#22c55e",
              warning: "#f59e0b",
              error: "#ef4444",
              info: "#3b82f6",
            },
            border: "#e2e8f0",
          },
          typography: {
            fontFamily: { sans: "Inter, system-ui, sans-serif", mono: "JetBrains Mono, monospace" },
            fontSize: {
              xs: "0.75rem",
              sm: "0.875rem",
              base: "1rem",
              lg: "1.125rem",
              xl: "1.25rem",
              "2xl": "1.5rem",
              "3xl": "1.875rem",
            },
            fontWeight: {
              normal: "400",
              medium: "500",
              semibold: "600",
              bold: "700",
            },
            lineHeight: { tight: "1.25", normal: "1.5", relaxed: "1.75" },
          },
          spacing: {
            xs: "0.25rem",
            sm: "0.5rem",
            md: "1rem",
            lg: "1.5rem",
            xl: "2rem",
            "2xl": "3rem",
          },
          radius: {
            none: "0",
            sm: "0.25rem",
            md: "0.375rem",
            lg: "0.5rem",
            full: "9999px",
          },
          shadow: {
            sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
            md: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            lg: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
          },
          custom: {},
        },
        changes: {},
        history: [],
        theme: "dark",
      },
    },
    bundleAssociation: null,
  },
};

describe("ProjectBrowser", () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    useDataContextStore.getState().reset();
    useProjectStateStore.getState().reset();
    usePreviewStateStore.getState().reset();
    resetStage1BundleStore();
    resetTokenState();
  });

  it("warns before switching projects when local state is dirty", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/projects?slug=alpha")) {
        return new Response(JSON.stringify(WORKSPACE_ALPHA), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.includes("/api/projects?slug=beta")) {
        return new Response(
          JSON.stringify({
            project: PROJECT_LIST.projects[1],
            workspace: {
              activeDesignSlug: null,
              workspace: null,
              bundleAssociation: null,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return new Response(JSON.stringify(PROJECT_LIST), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", fetchMock);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ProjectBrowser />);

    await screen.findByText("Alpha");

    fireEvent.click(screen.getAllByRole("button", { name: "Switch" })[0]);

    await waitFor(() => {
      expect(useProjectStateStore.getState().activeProjectSlug).toBe("alpha");
    });
    expect(usePreviewStateStore.getState().theme).toBe("dark");

    useTokenStateStore.getState().setToken("colors.primary", "#111111");
    await screen.findByText("Unsaved changes");

    fireEvent.click(screen.getByRole("button", { name: "Switch" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const requestedBeta = fetchMock.mock.calls.some(([input]) =>
      String(input).includes("/api/projects?slug=beta")
    );
    expect(requestedBeta).toBe(false);

    confirmSpy.mockRestore();
  });
});
