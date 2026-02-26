/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DesignExportButton } from "./DesignExportButton";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { useProjectStateStore } from "@/lib/stores/project-state";

// Mock the download module
vi.mock("@/lib/export/download", () => ({
  downloadFile: vi.fn(),
  getFilename: vi.fn((slug: string, format: string) => {
    const ext: Record<string, string> = {
      html: ".html",
      json: ".json",
      yaml: ".design.yaml",
      scss: ".scss",
    };
    return `${slug}${ext[format] ?? `.${format}`}`;
  }),
  getMimeType: vi.fn((format: string) => {
    const mimes: Record<string, string> = {
      html: "text/html",
      json: "application/json",
      yaml: "text/yaml",
      scss: "text/x-scss",
    };
    return mimes[format] ?? "text/plain";
  }),
}));

import { downloadFile } from "@/lib/export/download";

const MOCK_DOCUMENT = {
  metadata: { title: "Test Design", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  root: {
    nodeType: "layout" as const,
    layout: { type: "stack" as const, gap: 8 },
    children: [],
  },
};

describe("DesignExportButton", () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    useProjectStateStore.getState().reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders disabled when no design document is loaded", () => {
    render(<DesignExportButton />);

    const trigger = screen.getByRole("button", { name: "Export design" });
    expect(trigger).toBeTruthy();
    expect(trigger.hasAttribute("disabled")).toBe(true);
  });

  it("renders enabled when a design document is loaded", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useDocumentStateStore.getState().setDocument(MOCK_DOCUMENT as any);

    render(<DesignExportButton />);

    const trigger = screen.getByRole("button", { name: "Export design" });
    expect(trigger.hasAttribute("disabled")).toBe(false);
  });

  it("opens format picker popover on click", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useDocumentStateStore.getState().setDocument(MOCK_DOCUMENT as any);

    render(<DesignExportButton />);
    fireEvent.click(screen.getByRole("button", { name: "Export design" }));

    await waitFor(() => {
      expect(screen.getByText("HTML")).toBeTruthy();
      expect(screen.getByText("JSON")).toBeTruthy();
      expect(screen.getByText("YAML")).toBeTruthy();
      expect(screen.getByText("SCSS")).toBeTruthy();
    });
  });

  it("shows format descriptions in the picker", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useDocumentStateStore.getState().setDocument(MOCK_DOCUMENT as any);

    render(<DesignExportButton />);
    fireEvent.click(screen.getByRole("button", { name: "Export design" }));

    await waitFor(() => {
      expect(screen.getByText("Standalone HTML with inlined tokens")).toBeTruthy();
      expect(screen.getByText("Full design document + tokens + data")).toBeTruthy();
      expect(screen.getByText("Design document as YAML")).toBeTruthy();
      expect(screen.getByText("Token variables as SCSS")).toBeTruthy();
    });
  });

  it("triggers downloadFile when a format is selected", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useDocumentStateStore.getState().setDocument(MOCK_DOCUMENT as any);
    useProjectStateStore.getState().setActiveProject("my-dashboard", "home");

    render(<DesignExportButton />);
    fireEvent.click(screen.getByRole("button", { name: "Export design" }));
    await screen.findByText("JSON");

    fireEvent.click(screen.getByText("JSON"));

    // The export uses requestAnimationFrame, so wait for it
    await waitFor(() => {
      expect(downloadFile).toHaveBeenCalledTimes(1);
    });

    const call = vi.mocked(downloadFile).mock.calls[0][0];
    expect(call.filename).toBe("home.json");
    expect(call.mimeType).toBe("application/json");
    expect(call.content).toBeTruthy();
  });

  it("uses active design slug for filename", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useDocumentStateStore.getState().setDocument(MOCK_DOCUMENT as any);
    useProjectStateStore.getState().setActiveProject("dashboard", "home-page");

    render(<DesignExportButton />);
    fireEvent.click(screen.getByRole("button", { name: "Export design" }));
    await screen.findByText("HTML");

    fireEvent.click(screen.getByText("HTML"));

    await waitFor(() => {
      expect(downloadFile).toHaveBeenCalledTimes(1);
    });

    const call = vi.mocked(downloadFile).mock.calls[0][0];
    expect(call.filename).toBe("home-page.html");
  });

  it("falls back to project slug when no design slug", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useDocumentStateStore.getState().setDocument(MOCK_DOCUMENT as any);
    useProjectStateStore.getState().setActiveProject("my-project", null);

    render(<DesignExportButton />);
    fireEvent.click(screen.getByRole("button", { name: "Export design" }));
    await screen.findByText("SCSS");

    fireEvent.click(screen.getByText("SCSS"));

    await waitFor(() => {
      expect(downloadFile).toHaveBeenCalledTimes(1);
    });

    const call = vi.mocked(downloadFile).mock.calls[0][0];
    expect(call.filename).toBe("my-project.scss");
  });

  it("shows error when export fails for missing document", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useDocumentStateStore.getState().setDocument(MOCK_DOCUMENT as any);

    render(<DesignExportButton />);
    fireEvent.click(screen.getByRole("button", { name: "Export design" }));
    await screen.findByText("JSON");

    // Reset document after popover opens
    useDocumentStateStore.getState().setDocument(null);

    fireEvent.click(screen.getByText("JSON"));

    await waitFor(() => {
      expect(
        screen.getByText("No active design document. Load a document before exporting.")
      ).toBeTruthy();
    });

    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("shows 'Export As' header in popover", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useDocumentStateStore.getState().setDocument(MOCK_DOCUMENT as any);

    render(<DesignExportButton />);
    fireEvent.click(screen.getByRole("button", { name: "Export design" }));

    await waitFor(() => {
      expect(screen.getByText("Export As")).toBeTruthy();
    });
  });
});
