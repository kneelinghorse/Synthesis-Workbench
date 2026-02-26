/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FirstRunOnboarding } from "./FirstRunOnboarding";
import { createFoundryMcpClient } from "@/lib/mcp/foundry-client";
import { createStage1McpClient } from "@/lib/mcp/stage1-client";
import type { FoundryMcpClient } from "@/lib/mcp/foundry-client";
import type { Stage1McpClient } from "@/lib/mcp/stage1-client";

vi.mock("@/lib/mcp/stage1-client", () => ({
  createStage1McpClient: vi.fn(),
}));

vi.mock("@/lib/mcp/foundry-client", () => ({
  createFoundryMcpClient: vi.fn(),
}));

const mockServiceClients = ({
  stage1Reject = false,
  foundryReject = false,
}: {
  stage1Reject?: boolean;
  foundryReject?: boolean;
} = {}) => {
  vi.mocked(createStage1McpClient).mockReturnValue({
    listRuns: stage1Reject ? vi.fn().mockRejectedValue(new Error("stage1 down")) : vi.fn().mockResolvedValue([]),
    getArtifact: vi.fn(),
  } as Stage1McpClient);

  vi.mocked(createFoundryMcpClient).mockReturnValue({
    fetchStructuredData: foundryReject
      ? vi.fn().mockRejectedValue(new Error("foundry down"))
      : vi.fn().mockResolvedValue({
          dataset: "manifest",
          version: null,
          generatedAt: null,
          etag: "test",
          matched: true,
          payloadIncluded: false,
          path: "manifest.json",
          manifestPath: null,
          sizeBytes: 0,
          schemaValidated: true,
          raw: {},
        }),
    render: vi.fn(),
    validate: vi.fn(),
    buildTokens: vi.fn(),
  } as FoundryMcpClient);
};

const mockProjectsResponse = (count: number) => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ projects: Array.from({ length: count }), count }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("FirstRunOnboarding", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(createStage1McpClient).mockReset();
    vi.mocked(createFoundryMcpClient).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("auto-opens walkthrough for first-run workspaces with no projects", async () => {
    mockProjectsResponse(0);
    mockServiceClients();

    render(<FirstRunOnboarding />);

    expect(
      await screen.findByRole("dialog", { name: "First-run onboarding" })
    ).toBeTruthy();
    expect(screen.getByText("Connect services")).toBeTruthy();
  });

  it("does not auto-open walkthrough for returning users", async () => {
    mockProjectsResponse(2);
    mockServiceClients();

    render(<FirstRunOnboarding />);

    await waitFor(() => {
      expect(screen.getByText("Open walkthrough")).toBeTruthy();
    });

    expect(
      screen.queryByRole("dialog", { name: "First-run onboarding" })
    ).toBeNull();
  });

  it("persists skip action and suppresses auto-open on later mounts", async () => {
    mockProjectsResponse(0);
    mockServiceClients();

    const { unmount } = render(<FirstRunOnboarding />);
    await screen.findByRole("dialog", { name: "First-run onboarding" });

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    expect(window.localStorage.getItem("synthesis-workbench.onboarding.dismissed.v1")).toBe("1");
    expect(
      screen.queryByRole("dialog", { name: "First-run onboarding" })
    ).toBeNull();

    unmount();
    render(<FirstRunOnboarding />);

    await waitFor(() => {
      expect(screen.getByText("Start walkthrough")).toBeTruthy();
    });
    expect(
      screen.queryByRole("dialog", { name: "First-run onboarding" })
    ).toBeNull();
  });

  it("reports startup service issues in health check badges", async () => {
    mockProjectsResponse(1);
    mockServiceClients({ stage1Reject: true, foundryReject: true });

    render(<FirstRunOnboarding />);

    await waitFor(() => {
      expect(screen.getByText("Stage1: Issue")).toBeTruthy();
      expect(screen.getByText("Foundry: Issue")).toBeTruthy();
    });
  });
});
