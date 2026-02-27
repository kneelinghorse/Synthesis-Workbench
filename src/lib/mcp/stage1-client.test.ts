import { describe, expect, it, vi } from "vitest";

import {
  createStage1McpClient,
  getStage1McpClient,
  resetStage1McpClient,
} from "./stage1-client";

type MockFetchResponse = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  jsonPayload?: unknown;
  textPayload?: string;
};

const createMockFetch = (response: MockFetchResponse) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const requestUrl = typeof input === "string" ? input : input.toString();
    const textPayload =
      response.textPayload ??
      (response.jsonPayload !== undefined ? JSON.stringify(response.jsonPayload) : "");
    return {
      ok: response.ok ?? true,
      status: response.status ?? ((response.ok ?? true) ? 200 : 500),
      statusText: response.statusText ?? "",
      url: requestUrl,
      json: async () =>
        response.jsonPayload !== undefined
          ? response.jsonPayload
          : safeJsonParseForTest(textPayload),
      text: async () => textPayload,
    } as Response;
  }) as unknown as typeof fetch;

const safeJsonParseForTest = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

describe("stage1 MCP client", () => {
  it("normalizes listRuns output from MCP tool payloads", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        jsonrpc: "2.0",
        id: "1",
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                runs: [
                  {
                    run_id: "05a00c1f-63a7-4367-be79-5a2467b7f99d",
                    run_dir:
                      "/tmp/out/stage1/example.com/05a00c1f-63a7-4367-be79-5a2467b7f99d",
                    timestamp: "2026-01-08T17:15:29.324Z",
                  },
                ],
              }),
            },
          ],
        },
      },
    });

    const client = createStage1McpClient({
      baseUrl: "http://stage1.test/mcp",
      fetcher,
    });
    const runs = await client.listRuns();

    expect(runs).toHaveLength(1);
    expect(runs[0]?.runId).toBe("05a00c1f-63a7-4367-be79-5a2467b7f99d");
    expect(runs[0]?.hostname).toBe("example.com");
    expect(runs[0]?.timestamp).toBe("2026-01-08T17:15:29.324Z");
    expect(runs[0]?.runDir).toBe(
      "/tmp/out/stage1/example.com/05a00c1f-63a7-4367-be79-5a2467b7f99d"
    );
  });

  it("adds /mcp when base URL is a bare host", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({ runs: [] }),
            },
          ],
        },
      },
    });
    const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

    const client = createStage1McpClient({
      baseUrl: "http://stage1.test:3200",
      fetcher,
    });
    await client.listRuns();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://stage1.test:3200/mcp");
  });

  it("returns parsed artifact payloads", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        jsonrpc: "2.0",
        id: "2",
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                data: { kind: "style_fingerprint", version: "1.0.0" },
              }),
            },
          ],
        },
      },
    });

    const client = createStage1McpClient({
      baseUrl: "http://stage1.test/mcp",
      fetcher,
    });
    const artifact = await client.getArtifact(
      "/tmp/out/stage1/example.com/05a00c1f-63a7-4367-be79-5a2467b7f99d",
      "style_fingerprint.json"
    );

    expect(artifact).toEqual({ kind: "style_fingerprint", version: "1.0.0" });
  });

  it("throws when artifacts are missing", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        jsonrpc: "2.0",
        id: "3",
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({ message: "artifact not found" }),
            },
          ],
        },
      },
    });

    const client = createStage1McpClient({
      baseUrl: "http://stage1.test/mcp",
      fetcher,
    });

    await expect(
      client.getArtifact(
        "/tmp/out/stage1/example.com/05a00c1f-63a7-4367-be79-5a2467b7f99d",
        "missing.json"
      )
    ).rejects.toThrow("Stage1 artifact missing");
  });

  it("treats plain-text missing responses as NOT_FOUND", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        jsonrpc: "2.0",
        id: "3b",
        result: {
          content: [
            {
              type: "text",
              text: "Artifact not found: missing.json",
            },
          ],
        },
      },
    });

    const client = createStage1McpClient({
      baseUrl: "http://stage1.test/mcp",
      fetcher,
    });

    await expect(
      client.getArtifact(
        "/tmp/out/stage1/example.com/05a00c1f-63a7-4367-be79-5a2467b7f99d",
        "missing.json"
      )
    ).rejects.toThrow("Stage1 artifact missing");
  });

  it("surfaces HTTP 500 details in errors", async () => {
    const fetcher = createMockFetch({
      ok: false,
      status: 500,
      textPayload: JSON.stringify({
        error: { message: "Bridge failed to spawn stage1 server" },
      }),
    });
    const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

    const client = createStage1McpClient({
      baseUrl: "http://stage1.test:3200/mcp",
      fetcher,
    });

    await expect(client.listRuns()).rejects.toThrow(
      "Bridge failed to spawn stage1 server"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("supports configurable retry attempts", async () => {
    const fetcher = createMockFetch({
      ok: false,
      status: 500,
      textPayload: JSON.stringify({
        error: { message: "temporary outage" },
      }),
    });
    const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

    const client = createStage1McpClient({
      baseUrl: "http://stage1.test:3200/mcp",
      fetcher,
      retry: { maxAttempts: 1, baseDelayMs: 1 },
    });

    await expect(client.listRuns()).rejects.toThrow("temporary outage");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("tolerates malformed success payloads without crashing", async () => {
    const fetcher = createMockFetch({
      textPayload: "{invalid-json",
    });

    const client = createStage1McpClient({
      baseUrl: "http://stage1.test/mcp",
      fetcher,
    });

    await expect(client.listRuns()).resolves.toEqual([]);
  });

  it("rebuilds cached singleton client and recovers after transient outage", async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.NEXT_PUBLIC_STAGE1_MCP_URL;
    let callCount = 0;

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      callCount += 1;
      const requestUrl = typeof input === "string" ? input : input.toString();

      if (callCount <= 3) {
        return {
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          url: requestUrl,
          text: async () =>
            JSON.stringify({ error: { message: "bridge restarting" } }),
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        url: requestUrl,
        text: async () =>
          JSON.stringify({
            result: {
              content: [{ type: "text", text: JSON.stringify({ runs: [] }) }],
            },
          }),
      } as Response;
    }) as unknown as typeof fetch;

    process.env.NEXT_PUBLIC_STAGE1_MCP_URL = "http://stage1.test:3200/mcp";
    globalThis.fetch = fetcher;
    resetStage1McpClient();

    try {
      const runs = await getStage1McpClient().listRuns();
      expect(runs).toEqual([]);
      expect(callCount).toBe(4);
    } finally {
      resetStage1McpClient();
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) {
        delete process.env.NEXT_PUBLIC_STAGE1_MCP_URL;
      } else {
        process.env.NEXT_PUBLIC_STAGE1_MCP_URL = originalUrl;
      }
    }
  });

  it("throws INVALID_URL for malformed base URLs", () => {
    expect(() =>
      createStage1McpClient({
        baseUrl: "not-a-url",
        fetcher: createMockFetch({ jsonPayload: { result: {} } }),
      })
    ).toThrow("Stage1 MCP base URL is invalid");
  });

  it("accepts relative proxy paths without throwing", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        jsonrpc: "2.0",
        id: "1",
        result: { content: [{ type: "text", text: "[]" }] },
      },
    });

    // Relative paths like /api/stage1/mcp are valid same-origin proxy routes
    const client = createStage1McpClient({
      baseUrl: "/api/stage1/mcp",
      fetcher,
    });

    const runs = await client.listRuns();
    expect(runs).toEqual([]);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/stage1/mcp",
      expect.objectContaining({ method: "POST" })
    );
  });

  describe("inspectApp", () => {
    it("calls stage1_inspect_app and normalizes the result", async () => {
      const fetcher = createMockFetch({
        jsonPayload: {
          jsonrpc: "2.0",
          id: "inspect-1",
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  runId: "abc-123",
                  hostname: "example.com",
                  runDir: "/tmp/out/example.com/abc-123",
                  timestamp: "2026-02-27T10:00:00.000Z",
                  message: "App profile completed",
                }),
              },
            ],
          },
        },
      });

      const client = createStage1McpClient({
        baseUrl: "http://stage1.test/mcp",
        fetcher,
        retry: { maxAttempts: 1 },
      });
      const result = await client.inspectApp({ url: "https://example.com" });

      expect(result.run).not.toBeNull();
      expect(result.run?.runId).toBe("abc-123");
      expect(result.run?.hostname).toBe("example.com");
      expect(result.run?.runDir).toBe("/tmp/out/example.com/abc-123");
      expect(result.message).toBe("App profile completed");
    });

    it("sends correct MCP tool name and args", async () => {
      const fetcher = createMockFetch({
        jsonPayload: {
          result: {
            content: [
              { type: "text", text: JSON.stringify({ message: "ok" }) },
            ],
          },
        },
      });
      const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

      const client = createStage1McpClient({
        baseUrl: "http://stage1.test/mcp",
        fetcher,
        retry: { maxAttempts: 1 },
      });
      await client.inspectApp({
        url: "https://example.com",
        crawlDepth: 3,
        components: true,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.params.name).toBe("stage1_inspect_app");
      expect(body.params.arguments).toEqual({
        url: "https://example.com",
        crawlDepth: 3,
        components: true,
      });
    });

    it("returns null run when inspection fails", async () => {
      const fetcher = createMockFetch({
        jsonPayload: {
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: { message: "Connection refused" },
                }),
              },
            ],
          },
        },
      });

      const client = createStage1McpClient({
        baseUrl: "http://stage1.test/mcp",
        fetcher,
        retry: { maxAttempts: 1 },
      });
      const result = await client.inspectApp({ url: "https://unreachable.test" });

      expect(result.run).toBeNull();
      expect(result.message).toBe("Connection refused");
    });
  });

  describe("inspectSurface", () => {
    it("calls stage1_inspect_surface and normalizes the result", async () => {
      const fetcher = createMockFetch({
        jsonPayload: {
          jsonrpc: "2.0",
          id: "inspect-2",
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  runId: "surf-456",
                  hostname: "design.test",
                  runDir: "/tmp/out/design.test/surf-456",
                  timestamp: "2026-02-27T11:00:00.000Z",
                  message: "Surface snapshot captured",
                }),
              },
            ],
          },
        },
      });

      const client = createStage1McpClient({
        baseUrl: "http://stage1.test/mcp",
        fetcher,
        retry: { maxAttempts: 1 },
      });
      const result = await client.inspectSurface({ url: "https://design.test" });

      expect(result.run).not.toBeNull();
      expect(result.run?.runId).toBe("surf-456");
      expect(result.run?.hostname).toBe("design.test");
      expect(result.message).toBe("Surface snapshot captured");
    });

    it("sends correct MCP tool name and args", async () => {
      const fetcher = createMockFetch({
        jsonPayload: {
          result: {
            content: [
              { type: "text", text: JSON.stringify({ message: "ok" }) },
            ],
          },
        },
      });
      const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

      const client = createStage1McpClient({
        baseUrl: "http://stage1.test/mcp",
        fetcher,
        retry: { maxAttempts: 1 },
      });
      await client.inspectSurface({
        url: "https://design.test",
        passes: ["style.fingerprint"],
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.params.name).toBe("stage1_inspect_surface");
      expect(body.params.arguments).toEqual({
        url: "https://design.test",
        passes: ["style.fingerprint"],
      });
    });
  });
});
