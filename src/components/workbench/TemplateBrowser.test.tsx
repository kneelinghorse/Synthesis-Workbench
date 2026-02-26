/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { TemplateBrowser } from "./TemplateBrowser";
import { useDataContextStore } from "@/lib/stores/data-context";
import { useDocumentStateStore } from "@/lib/stores/document-state";

const LIST_PAYLOAD = {
  listed: true,
  count: 2,
  templates: [
    {
      source: "built-in",
      slug: "dashboard",
      name: "Dashboard Starter",
      description: "Analytics dashboard shell",
      category: "dashboard",
      requiredComponents: ["oods:Tabs", "oods:Card"],
    },
    {
      source: "custom",
      slug: "ops-custom",
      name: "Ops Custom",
      description: "Custom operations starter",
      category: "form",
      requiredComponents: ["oods:Card"],
    },
  ],
};

const DETAIL_PAYLOAD = {
  loaded: true,
  source: "built-in",
  slug: "dashboard",
  template: {
    kind: "template",
    metadata: {
      name: "Dashboard Starter",
      description: "Analytics dashboard shell",
      category: "dashboard",
    },
    document: {
      metadata: {
        title: "Dashboard Starter",
      },
      root: {
        nodeType: "layout",
        layout: { type: "stack", gap: 16 },
        children: [
          {
            nodeType: "component",
            id: "nav-1",
            ref: "oods:Tabs",
            props: {},
          },
          {
            nodeType: "component",
            id: "metric-1",
            ref: "oods:Card",
            props: {},
          },
        ],
      },
    },
    requiredComponents: ["oods:Tabs", "oods:Card"],
  },
};

const CUSTOM_DETAIL_PAYLOAD = {
  loaded: true,
  source: "custom",
  slug: "ops-custom",
  template: {
    kind: "template",
    metadata: {
      name: "Ops Custom",
      description: "Custom operations starter",
      category: "form",
    },
    document: {
      metadata: {
        title: "Ops Custom",
      },
      root: {
        nodeType: "component",
        id: "custom-card",
        ref: "oods:Card",
        props: {},
      },
    },
    requiredComponents: ["oods:Card"],
  },
};

const createFetchMock = () =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/templates?slug=dashboard")) {
      return new Response(JSON.stringify(DETAIL_PAYLOAD), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/templates?slug=ops-custom")) {
      return new Response(JSON.stringify(CUSTOM_DETAIL_PAYLOAD), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify(LIST_PAYLOAD), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

describe("TemplateBrowser", () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    useDataContextStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lists templates and applies selected template into document state", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    render(<TemplateBrowser />);

    await waitFor(() =>
      expect(screen.getAllByText("Dashboard Starter").length).toBeGreaterThan(0)
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/templates?slug=dashboard",
        expect.objectContaining({ cache: "no-store" })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply Template" }));

    await screen.findByText(/Applied template "Dashboard Starter"/);
    const document = useDocumentStateStore.getState().document;
    expect(document?.metadata.title).toBe("Dashboard Starter");
    expect(document?.root.nodeType).toBe("layout");
  });

  it("filters by category and updates selected template preview", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    render(<TemplateBrowser />);

    await waitFor(() =>
      expect(screen.getAllByText("Dashboard Starter").length).toBeGreaterThan(0)
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "form" },
    });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/templates?slug=ops-custom",
        expect.objectContaining({ cache: "no-store" })
      )
    );

    await screen.findByRole("heading", { name: "Ops Custom" });
  });
});
