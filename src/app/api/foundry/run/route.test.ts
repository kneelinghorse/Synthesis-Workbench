import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("/api/foundry/run route", () => {
  const originalFetch = globalThis.fetch;
  const originalOodsUrl = process.env.OODS_FOUNDRY_MCP_URL;
  const originalPublicUrl = process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;

    if (originalOodsUrl === undefined) {
      delete process.env.OODS_FOUNDRY_MCP_URL;
    } else {
      process.env.OODS_FOUNDRY_MCP_URL = originalOodsUrl;
    }

    if (originalPublicUrl === undefined) {
      delete process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;
    } else {
      process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL = originalPublicUrl;
    }
  });

  it("forwards X-Bridge-Approval header to upstream Foundry bridge", async () => {
    process.env.OODS_FOUNDRY_MCP_URL = "http://foundry.test/mcp";
    delete process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      return new Response(
        JSON.stringify({
          approved: headers.get("x-bridge-approval"),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const response = await POST(
      new Request("http://localhost/api/foundry/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bridge-approval": "always",
        },
        body: JSON.stringify({ tool: "repl.render", input: { mode: "full" } }),
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [upstreamUrl, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(upstreamUrl).toBe("http://foundry.test/run");
    const headers = new Headers(init.headers);
    expect(headers.get("x-bridge-approval")).toBe("always");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approved: "always" });
  });

  it("omits X-Bridge-Approval when the request header is absent", async () => {
    process.env.OODS_FOUNDRY_MCP_URL = "http://foundry.test/run";
    delete process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      return new Response(
        JSON.stringify({
          approvalHeader: headers.get("x-bridge-approval"),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const response = await POST(
      new Request("http://localhost/api/foundry/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ tool: "repl.render", input: { mode: "full" } }),
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const headers = new Headers(init.headers);
    expect(headers.get("x-bridge-approval")).toBeNull();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approvalHeader: null });
  });
});
