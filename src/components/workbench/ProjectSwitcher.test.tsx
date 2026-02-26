/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProjectSwitcher } from "./ProjectSwitcher";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { useProjectStateStore } from "@/lib/stores/project-state";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import { resetTokenState } from "@/lib/stores/token-state";
import { resetStage1BundleStore } from "@/lib/stores/stage1-bundle";
import { useDataContextStore } from "@/lib/stores/data-context";

const PROJECT_LIST = {
  projects: [
    {
      slug: "alpha",
      name: "Alpha Project",
      designCount: 2,
      updatedAt: "2026-02-20T00:00:00.000Z",
      lastModifiedAt: "2026-02-20T00:00:00.000Z",
    },
    {
      slug: "beta",
      name: "Beta Project",
      designCount: 0,
      updatedAt: "2026-02-19T00:00:00.000Z",
      lastModifiedAt: "2026-02-19T00:00:00.000Z",
    },
  ],
  count: 2,
};

const WORKSPACE_BETA = {
  project: PROJECT_LIST.projects[1],
  workspace: {
    activeDesignSlug: null,
    workspace: null,
    bundleAssociation: null,
  },
};

function makeFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();

    if (method === "POST" && url.includes("/api/projects")) {
      const body = JSON.parse(init?.body as string);
      const slug = body.name.toLowerCase().replace(/\s+/g, "-");
      return new Response(
        JSON.stringify({ project: { slug, name: body.name } }),
        { status: 201, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes("/api/projects?slug=beta")) {
      return new Response(JSON.stringify(WORKSPACE_BETA), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/api/projects?slug=")) {
      const slug = new URL(url, "http://localhost").searchParams.get("slug");
      return new Response(
        JSON.stringify({
          project: { slug, name: slug, designCount: 0, updatedAt: new Date().toISOString(), lastModifiedAt: new Date().toISOString() },
          workspace: { activeDesignSlug: null, workspace: null, bundleAssociation: null },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(PROJECT_LIST), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("ProjectSwitcher", () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    useDataContextStore.getState().reset();
    useProjectStateStore.getState().reset();
    usePreviewStateStore.getState().reset();
    resetStage1BundleStore();
    resetTokenState();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders trigger showing 'No project' when nothing is active", () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<ProjectSwitcher />);

    const trigger = screen.getByRole("button", { name: "Switch project" });
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain("No project");
  });

  it("shows active project slug in trigger when a project is set", () => {
    vi.stubGlobal("fetch", makeFetchMock());
    useProjectStateStore.getState().setActiveProject("alpha", null);

    render(<ProjectSwitcher />);

    const trigger = screen.getByRole("button", { name: "Switch project" });
    expect(trigger.textContent).toContain("alpha");
  });

  it("opens popover and lists projects on click", async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));

    await waitFor(() => {
      expect(screen.getByText("Alpha Project")).toBeTruthy();
      expect(screen.getByText("Beta Project")).toBeTruthy();
    });
  });

  it("shows design count for each project", async () => {
    vi.stubGlobal("fetch", makeFetchMock());

    render(<ProjectSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));

    await waitFor(() => {
      expect(screen.getByText("2 designs")).toBeTruthy();
      expect(screen.getByText("0 designs")).toBeTruthy();
    });
  });

  it("switches project on click and updates store", async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    useProjectStateStore.getState().setActiveProject("alpha", null);

    render(<ProjectSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));

    await screen.findByText("Beta Project");
    fireEvent.click(screen.getByText("Beta Project"));

    await waitFor(() => {
      expect(useProjectStateStore.getState().activeProjectSlug).toBe("beta");
    });

    const slugCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/projects?slug=beta")
    );
    expect(slugCalls.length).toBeGreaterThan(0);
  });

  it("shows create form when New button is clicked", async () => {
    vi.stubGlobal("fetch", makeFetchMock());

    render(<ProjectSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));

    await screen.findByText("Alpha Project");
    fireEvent.click(screen.getByRole("button", { name: "Create new project" }));

    expect(screen.getByPlaceholderText("Project name...")).toBeTruthy();
  });

  it("creates project via form and switches to it", async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));

    await screen.findByText("Alpha Project");
    fireEvent.click(screen.getByRole("button", { name: "Create new project" }));

    const input = screen.getByPlaceholderText("Project name...");
    fireEvent.change(input, { target: { value: "Dashboard" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(useProjectStateStore.getState().activeProjectSlug).toBe("dashboard");
    });

    const postCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(postCalls.length).toBe(1);
  });

  it("shows error when project list fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Server down" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        })
      )
    );

    render(<ProjectSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));

    await waitFor(() => {
      expect(screen.getByText("Server down")).toBeTruthy();
    });
  });

  it("shows empty state when no projects exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ projects: [], count: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    render(<ProjectSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));

    await waitFor(() => {
      expect(screen.getByText("No projects yet")).toBeTruthy();
    });
  });

  it("does not re-fetch workspace when clicking the already-active project", async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    useProjectStateStore.getState().setActiveProject("alpha", null);

    render(<ProjectSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));

    // "Alpha Project" appears in both trigger and list — find the list item
    await waitFor(() => {
      expect(screen.getAllByText("Alpha Project").length).toBeGreaterThanOrEqual(2);
    });
    // Click the list item (second match, inside the popover content)
    const matches = screen.getAllByText("Alpha Project");
    fireEvent.click(matches[matches.length - 1]);

    // Should not have fetched workspace for the already-active slug
    const workspaceCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/projects?slug=alpha")
    );
    expect(workspaceCalls.length).toBe(0);
  });
});
