import { describe, expect, it, vi } from "vitest";

import {
  createFoundryMcpClient,
  getFoundryMcpClient,
  resetFoundryMcpClient,
} from "./foundry-client";

type MockFetchResponse = {
  ok?: boolean;
  status?: number;
  textPayload?: string;
  jsonPayload?: unknown;
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
      statusText: "",
      url: requestUrl,
      text: async () => textPayload,
    } as Response;
  }) as unknown as typeof fetch;

describe("foundry MCP client", () => {
  it("uses JSON-RPC payloads for /mcp endpoints", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        jsonrpc: "2.0",
        id: "1",
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                html: "<div>Preview</div>",
                warnings: ["Minor warning"],
              }),
            },
          ],
        },
      },
    });
    const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

    const client = createFoundryMcpClient({
      baseUrl: "http://foundry.test/mcp",
      fetcher,
    });

    const output = await client.render({ type: "component" });
    expect(output.html).toBe("<div>Preview</div>");
    expect(output.warnings).toEqual(["Minor warning"]);

    const requestBody = JSON.parse(
      String(fetchSpy.mock.calls[0]?.[1]?.body ?? "{}")
    ) as Record<string, unknown>;
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://foundry.test/mcp");
    expect(requestBody.method).toBe("tools.call");
    expect(requestBody.params).toMatchObject({
      name: "repl.render",
      arguments: { mode: "full", apply: true, schema: { type: "component" } },
    });
  });

  it("uses bridge payloads for /run endpoints", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        ok: true,
        result: {
          html: "<div>Bridge Preview</div>",
          warnings: ["Bridge warning"],
        },
      },
    });
    const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

    const client = createFoundryMcpClient({
      baseUrl: "http://foundry.test/run",
      fetcher,
    });
    const output = await client.render({ type: "component" });

    expect(output.html).toBe("<div>Bridge Preview</div>");
    expect(output.warnings).toEqual(["Bridge warning"]);

    const requestBody = JSON.parse(
      String(fetchSpy.mock.calls[0]?.[1]?.body ?? "{}")
    ) as Record<string, unknown>;
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://foundry.test/run");
    expect(requestBody).toEqual({
      tool: "repl.render",
      input: { mode: "full", apply: true, schema: { type: "component" } },
    });
  });

  it("passes through explicit REPL payloads and defaults apply-mode", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        ok: true,
        result: {
          html: "<div>Bridge Preview</div>",
        },
      },
    });
    const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

    const client = createFoundryMcpClient({
      baseUrl: "http://foundry.test/run",
      fetcher,
    });

    await client.render({
      mode: "full",
      schema: {
        version: "2025.11",
        screens: [{ id: "screen-1", component: "ArchiveSummary" }],
      },
    });

    const requestBody = JSON.parse(
      String(fetchSpy.mock.calls[0]?.[1]?.body ?? "{}")
    ) as Record<string, unknown>;
    expect(requestBody).toEqual({
      tool: "repl.render",
      input: {
        mode: "full",
        apply: true,
        schema: {
          version: "2025.11",
          screens: [{ id: "screen-1", component: "ArchiveSummary" }],
        },
      },
    });
  });

  it("preserves explicit apply=false for dry-run compatibility", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        ok: true,
        result: {
          status: "ok",
          preview: { summary: "Dry-run preview" },
        },
      },
    });
    const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

    const client = createFoundryMcpClient({
      baseUrl: "http://foundry.test/run",
      fetcher,
    });

    await client.render({
      mode: "full",
      apply: false,
      schema: {
        version: "2025.11",
        screens: [{ id: "screen-1", component: "ArchiveSummary" }],
      },
    });

    const requestBody = JSON.parse(
      String(fetchSpy.mock.calls[0]?.[1]?.body ?? "{}")
    ) as Record<string, unknown>;
    expect(requestBody).toEqual({
      tool: "repl.render",
      input: {
        mode: "full",
        apply: false,
        schema: {
          version: "2025.11",
          screens: [{ id: "screen-1", component: "ArchiveSummary" }],
        },
      },
    });
  });

  it("parses apply-mode HTML responses from Foundry bridge", async () => {
    const html = "<!DOCTYPE html><html><body><main data-oods-component=\"Button\">OK</main></body></html>";
    const fetcher = createMockFetch({
      jsonPayload: {
        ok: true,
        result: {
          html,
          warnings: ["Rendered in apply mode"],
        },
      },
    });

    const client = createFoundryMcpClient({
      baseUrl: "http://foundry.test/run",
      fetcher,
    });

    const output = await client.render({ type: "component" });

    expect(output.html).toBe(html);
    expect(output.warnings).toEqual(["Rendered in apply mode"]);
  });

  it("accepts status/preview render payloads when HTML is absent", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        ok: true,
        result: {
          status: "ok",
          preview: {
            summary: "Render ready for 1 screen",
          },
          warnings: [],
        },
      },
    });

    const client = createFoundryMcpClient({
      baseUrl: "http://foundry.test/run",
      fetcher,
    });

    const output = await client.render({
      mode: "full",
      schema: {
        version: "2025.11",
        screens: [{ id: "screen-1", component: "ArchiveSummary" }],
      },
    });

    expect(output.html).toContain("Render ready for 1 screen");
  });

  it("defaults bare Foundry host URLs to /run bridge endpoint", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        ok: true,
        result: {
          errors: ["Missing schema"],
          warnings: ["Deprecated token"],
        },
      },
    });
    const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

    const client = createFoundryMcpClient({
      baseUrl: "http://foundry.test:4466",
      fetcher,
    });

    const output = await client.validate({ type: "component" });
    expect(output.valid).toBe(false);
    expect(output.errors).toEqual(["Missing schema"]);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://foundry.test:4466/run");
    const requestBody = JSON.parse(
      String(fetchSpy.mock.calls[0]?.[1]?.body ?? "{}")
    ) as Record<string, unknown>;
    expect(requestBody).toEqual({
      tool: "repl.validate",
      input: { mode: "full", schema: { type: "component" } },
    });
  });

  it("reads base URL from OODS_FOUNDRY_MCP_URL when NEXT_PUBLIC is unset", async () => {
    const originalPublicUrl = process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;
    const originalUrl = process.env.OODS_FOUNDRY_MCP_URL;

    const fetcher = createMockFetch({
      jsonPayload: {
        ok: true,
        result: {
          html: "<div>Env Preview</div>",
        },
      },
    });
    const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

    try {
      delete process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;
      process.env.OODS_FOUNDRY_MCP_URL = "http://foundry.test/run";

      const client = createFoundryMcpClient({ fetcher });
      const output = await client.render({ type: "component" });

      expect(output.html).toBe("<div>Env Preview</div>");
      expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://foundry.test/run");
    } finally {
      if (originalPublicUrl === undefined) {
        delete process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;
      } else {
        process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL = originalPublicUrl;
      }

      if (originalUrl === undefined) {
        delete process.env.OODS_FOUNDRY_MCP_URL;
      } else {
        process.env.OODS_FOUNDRY_MCP_URL = originalUrl;
      }
    }
  });

  it("fetches structured component data via Foundry bridge", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        ok: true,
        result: {
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
            components: [],
          },
        },
      },
    });
    const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

    const client = createFoundryMcpClient({
      baseUrl: "http://foundry.test/run",
      fetcher,
    });

    const output = await client.fetchStructuredData("components");

    expect(output.dataset).toBe("components");
    expect(output.schemaValidated).toBe(true);
    expect(output.payloadIncluded).toBe(true);

    const requestBody = JSON.parse(
      String(fetchSpy.mock.calls[0]?.[1]?.body ?? "{}")
    ) as Record<string, unknown>;
    expect(requestBody).toEqual({
      tool: "structuredData.fetch",
      input: {
        dataset: "components",
      },
    });
  });

  it("returns token build payloads", async () => {
    const fetcher = createMockFetch({
      jsonPayload: {
        ok: true,
        result: {
          tokens: { "colors.primary": "#000000" },
          artifacts: { css: ":root{--colors-primary:#000000;}" },
        },
      },
    });

    const client = createFoundryMcpClient({
      baseUrl: "http://foundry.test/run",
      fetcher,
    });

    const output = await client.buildTokens({ name: "Brand" }, { name: "Theme" });
    expect(output.tokens).toEqual({ "colors.primary": "#000000" });
    expect(output.artifacts).toEqual({
      css: ":root{--colors-primary:#000000;}",
    });
  });

  it("surfaces bridge HTTP errors with response details", async () => {
    const fetcher = createMockFetch({
      ok: false,
      status: 500,
      jsonPayload: {
        error: { message: "Bridge failed to execute repl.render" },
      },
    });
    const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

    const client = createFoundryMcpClient({
      baseUrl: "http://foundry.test/run",
      fetcher,
    });

    await expect(client.render({ component: "Button" })).rejects.toThrow(
      "Bridge failed to execute repl.render"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("supports configurable retry attempts", async () => {
    const fetcher = createMockFetch({
      ok: false,
      status: 500,
      jsonPayload: {
        error: { message: "foundry unavailable" },
      },
    });
    const fetchSpy = fetcher as unknown as ReturnType<typeof vi.fn>;

    const client = createFoundryMcpClient({
      baseUrl: "http://foundry.test/run",
      fetcher,
      retry: { maxAttempts: 1, baseDelayMs: 1 },
    });

    await expect(client.render({ component: "Button" })).rejects.toThrow(
      "foundry unavailable"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("tolerates malformed success payloads without crashing", async () => {
    const fetcher = createMockFetch({
      textPayload: "{broken-json",
    });

    const client = createFoundryMcpClient({
      baseUrl: "http://foundry.test/run",
      fetcher,
    });

    const result = await client.render({ component: "Button" });
    expect(result.html).toBe("{broken-json");
  });

  it("rebuilds cached singleton client and recovers after transient outage", async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;
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
            JSON.stringify({ error: { message: "foundry restarting" } }),
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        url: requestUrl,
        text: async () =>
          JSON.stringify({
            ok: true,
            result: { html: "<div>Recovered</div>" },
          }),
      } as Response;
    }) as unknown as typeof fetch;

    process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL = "http://foundry.test/run";
    globalThis.fetch = fetcher;
    resetFoundryMcpClient();

    try {
      const result = await getFoundryMcpClient().render({ component: "Button" });
      expect(result.html).toBe("<div>Recovered</div>");
      expect(callCount).toBe(4);
    } finally {
      resetFoundryMcpClient();
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) {
        delete process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL;
      } else {
        process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL = originalUrl;
      }
    }
  });

  it("throws INVALID_URL for malformed base URLs", () => {
    expect(() =>
      createFoundryMcpClient({
        baseUrl: "not-a-url",
        fetcher: createMockFetch({ jsonPayload: { ok: true, result: {} } }),
      })
    ).toThrow("Foundry MCP base URL is invalid");
  });
});
