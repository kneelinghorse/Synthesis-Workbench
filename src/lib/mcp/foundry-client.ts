import { addBreadcrumb, retryWithBackoff, type RetryOptions } from "./retry";

export type FoundryRenderOutput = {
  html: string;
  warnings?: string[];
  meta?: Record<string, unknown>;
  raw: unknown;
};

export type FoundryValidateOutput = {
  errors: string[];
  warnings: string[];
  valid: boolean;
  raw: unknown;
};

export type FoundryTokenBuildOutput = {
  tokens?: Record<string, string>;
  artifacts?: Record<string, unknown>;
  raw: unknown;
};

export type FoundryStructuredDataset = "components" | "tokens" | "manifest";

export type FoundryStructuredDataOutput<TPayload = Record<string, unknown>> = {
  dataset: FoundryStructuredDataset;
  version: string | null;
  generatedAt: string | null;
  etag: string;
  matched: boolean;
  payloadIncluded: boolean;
  path: string;
  manifestPath: string | null;
  sizeBytes: number;
  schemaValidated: boolean;
  validationErrors?: string[];
  warnings?: string[];
  meta?: Record<string, unknown>;
  payload?: TPayload;
  raw: unknown;
};

export type FoundryMcpClient = {
  render: (schema: unknown) => Promise<FoundryRenderOutput>;
  validate: (schema: unknown) => Promise<FoundryValidateOutput>;
  buildTokens: (brand: unknown, theme?: unknown) => Promise<FoundryTokenBuildOutput>;
  fetchStructuredData: <TPayload = Record<string, unknown>>(
    dataset: FoundryStructuredDataset,
    options?: {
      ifNoneMatch?: string;
      includePayload?: boolean;
    }
  ) => Promise<FoundryStructuredDataOutput<TPayload>>;
};

export type FoundryMcpClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  retry?: RetryOptions;
};

type McpToolResponse = {
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

class FoundryMcpError extends Error {
  code?: string;
  data?: unknown;

  constructor(message: string, code?: string, data?: unknown) {
    super(message);
    this.name = "FoundryMcpError";
    this.code = code;
    this.data = data;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringValue = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return undefined;
};

const truncate = (value: string, max = 280) =>
  value.length <= max ? value : `${value.slice(0, max - 3)}...`;

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => toStringValue(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  const single = toStringValue(value);
  return single ? [single] : [];
};

const formatIssue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const code = toStringValue(value.code);
  const component = toStringValue(value.component);
  const message = toStringValue(value.message);
  const path = toStringValue(value.path);

  const prefixParts = [code, component].filter(
    (part): part is string => Boolean(part && part.trim())
  );
  const prefix = prefixParts.length ? `${prefixParts.join(" ")}: ` : "";
  const suffix = path ? ` (${path})` : "";

  const trimmedMessage = message?.trim();
  if (trimmedMessage) {
    return `${prefix}${trimmedMessage}${suffix}`;
  }

  return null;
};

const toIssueStrings = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => formatIssue(entry))
      .filter((entry): entry is string => Boolean(entry));
  }
  const single = formatIssue(value);
  return single ? [single] : [];
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const resolveFetch = (fetcher?: typeof fetch): typeof fetch => {
  if (fetcher) {
    return fetcher;
  }
  if (typeof fetch === "function") {
    return fetch;
  }
  throw new FoundryMcpError(
    "Foundry MCP client requires a fetch implementation.",
    "NO_FETCH"
  );
};

const createTimeoutSignal = (timeoutMs: number | undefined) => {
  if (!timeoutMs) {
    return { signal: undefined, cleanup: () => void 0 };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
};

const createRequestId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `foundry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const extractToolPayload = (result: unknown): unknown => {
  if (typeof result === "string") {
    return safeJsonParse(result);
  }

  if (!isRecord(result)) {
    return result;
  }

  if (Array.isArray(result.content)) {
    for (const entry of result.content) {
      if (!isRecord(entry)) continue;
      const type = toStringValue(entry.type);
      if (type === "json" && "json" in entry) {
        return entry.json;
      }
      if (type === "text" && typeof entry.text === "string") {
        return safeJsonParse(entry.text);
      }
    }
  }

  if ("payload" in result) {
    return result.payload;
  }
  if ("data" in result) {
    return result.data;
  }
  if ("result" in result) {
    return result.result;
  }

  return result;
};

const isBrowserRuntime = () =>
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  process.env.NODE_ENV !== "test";

const readFoundryMcpBaseUrl = () => {
  const explicit =
    process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL?.trim() ||
    process.env.OODS_FOUNDRY_MCP_URL?.trim();

  if (isBrowserRuntime()) {
    // If Foundry isn't configured, preserve the original error behavior.
    if (!explicit) {
      return explicit;
    }

    // Allow explicitly configured same-origin proxy paths.
    if (
      explicit.startsWith("/") ||
      explicit.startsWith("./") ||
      explicit.startsWith("../")
    ) {
      return explicit;
    }

    // Default to the Workbench server proxy to avoid CORS / localhost binding issues.
    // Forge is bridge-only — all configured URLs proxy through /api/foundry/run.
    return "/api/foundry/run";
  }

  return explicit;
};

type FoundryTransport = "bridge" | "jsonrpc";

type FoundryEndpoint = {
  url: string;
  transport: FoundryTransport;
};

const normalizeFoundryMcpEndpoint = (value: string): FoundryEndpoint => {
  const trimmed = value.trim();

  // Support same-origin proxy routes (e.g. /api/foundry/run) for browser usage.
  if (trimmed.startsWith("/")) {
    const pathname = trimmed.replace(/\/+$/, "") || "/";
    if (pathname.endsWith("/mcp")) {
      return { url: pathname, transport: "jsonrpc" };
    }
    if (pathname.endsWith("/run")) {
      return { url: pathname, transport: "bridge" };
    }

    // Default to bridge /run for bare paths (e.g. /api/foundry).
    return {
      url: `${pathname === "/" ? "" : pathname}/run`,
      transport: "bridge",
    };
  }

  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";

    if (pathname === "/mcp") {
      parsed.pathname = "/mcp";
      return { url: parsed.toString(), transport: "jsonrpc" };
    }

    if (pathname === "/run") {
      parsed.pathname = "/run";
      return { url: parsed.toString(), transport: "bridge" };
    }

    // Bare host (e.g. http://127.0.0.1:4466) defaults to bridge /run.
    if (pathname === "/") {
      parsed.pathname = "/run";
      return { url: parsed.toString(), transport: "bridge" };
    }

    // Custom path fallback for legacy JSON-RPC endpoints.
    parsed.pathname = pathname;
    return { url: parsed.toString(), transport: "jsonrpc" };
  } catch {
    throw new FoundryMcpError(
      `Foundry MCP base URL is invalid: ${value}`,
      "INVALID_URL",
      value
    );
  }
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const bodyText = await response.text().catch(() => "");
  if (!bodyText || bodyText.trim().length === 0) {
    return null;
  }
  return safeJsonParse(bodyText);
};

const parseHttpError = async (response: Response) => {
  const parsedBody = await parseResponseBody(response);
  const bodyText =
    typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody);
  const messageFromBody =
    (isRecord(parsedBody) &&
      (toStringValue(parsedBody.message) ||
        (isRecord(parsedBody.error) && toStringValue(parsedBody.error.message)))) ||
    (bodyText && bodyText !== "null" ? truncate(bodyText) : "");
  const details = messageFromBody ? `: ${messageFromBody}` : "";

  return {
    message: `Foundry MCP request failed (${response.status}) at ${response.url}${details}`,
    data: {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      body: parsedBody,
    },
  };
};

const normalizeRenderOutput = (payload: unknown): FoundryRenderOutput => {
  const raw = payload;
  if (typeof payload === "string") {
    return { html: payload, raw };
  }

  if (isRecord(payload)) {
    const html =
      toStringValue(payload.html) ??
      toStringValue(payload.rendered) ??
      toStringValue(payload.output) ??
      toStringValue(payload.content);
    if (html) {
      return {
        html,
        warnings: toIssueStrings(payload.warnings ?? payload.warning),
        meta: isRecord(payload.meta) ? payload.meta : undefined,
        raw,
      };
    }

    const errors = toIssueStrings(payload.errors);
    if (errors.length > 0) {
      throw new FoundryMcpError(
        `Foundry render failed: ${errors.join("; ")}`,
        "TOOL_ERROR",
        raw
      );
    }

    // Some Foundry bridge deployments return structured preview metadata
    // (status/preview/renderedTree) instead of direct HTML.
    const status = toStringValue(payload.status);
    if (status === "ok") {
      const previewSummary =
        isRecord(payload.preview) && typeof payload.preview.summary === "string"
          ? payload.preview.summary
          : undefined;
      const summary = previewSummary?.trim() || "Rendered via Foundry";

      const renderedTree = payload.renderedTree;
      const treeScreens =
        isRecord(renderedTree) && Array.isArray(renderedTree.screens)
          ? renderedTree.screens
          : null;
      const screenLines =
        treeScreens?.flatMap((screen) => {
          if (!isRecord(screen)) return [];
          const id = toStringValue(screen.id) ?? "";
          const component = toStringValue(screen.component) ?? "";
          if (!id && !component) return [];
          return [`${component || "Screen"}${id ? ` · ${id}` : ""}`];
        }) ?? [];

      const treeHtml = screenLines.length
        ? `<ul style="margin: 8px 0 0; padding-left: 18px;">${screenLines
            .map((line) => `<li>${escapeHtml(line)}</li>`)
            .join("")}</ul>`
        : "";
      return {
        html: `<div data-foundry-render="summary" style="font-family: ui-sans-serif, system-ui; font-size: 12px; line-height: 1.4; color: rgba(15,23,42,0.88); border: 1px solid rgba(15,23,42,0.14); background: rgba(255,255,255,0.96); border-radius: 12px; padding: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.08);">
  <div style="font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.75;">Foundry preview (dry-run)</div>
  <div style="margin-top: 6px; font-weight: 600;">${escapeHtml(summary)}</div>
  ${
    screenLines.length
      ? `<div style="margin-top: 8px; opacity: 0.75;">Screens:</div>${treeHtml}`
      : ""
  }
</div>`,
        warnings: toIssueStrings(payload.warnings ?? payload.warning),
        meta: isRecord(payload.meta) ? payload.meta : undefined,
        raw,
      };
    }
  }

  throw new FoundryMcpError("Foundry render response missing HTML.", "MISSING_HTML", raw);
};

const normalizeValidateOutput = (payload: unknown): FoundryValidateOutput => {
  const raw = payload;

  if (isRecord(payload)) {
    const errors = toIssueStrings(payload.errors ?? payload.issues ?? payload.error);
    const warnings = toIssueStrings(payload.warnings ?? payload.warning);
    const status = toStringValue(payload.status);
    const valid =
      typeof payload.valid === "boolean"
        ? payload.valid
        : status === "ok"
          ? true
          : status === "invalid" || status === "error"
            ? false
            : errors.length === 0;
    return {
      errors,
      warnings,
      valid,
      raw,
    };
  }

  return {
    errors: [],
    warnings: [],
    valid: true,
    raw,
  };
};

const normalizeTokenBuildOutput = (payload: unknown): FoundryTokenBuildOutput => {
  const raw = payload;
  if (isRecord(payload)) {
    return {
      tokens: isRecord(payload.tokens) ? (payload.tokens as Record<string, string>) : undefined,
      artifacts: isRecord(payload.artifacts)
        ? (payload.artifacts as Record<string, unknown>)
        : undefined,
      raw,
    };
  }

  return { raw };
};

const isFoundryDataset = (value: string | undefined): value is FoundryStructuredDataset =>
  value === "components" || value === "tokens" || value === "manifest";

const normalizeStructuredDataOutput = <TPayload = Record<string, unknown>>(
  requestedDataset: FoundryStructuredDataset,
  payload: unknown
): FoundryStructuredDataOutput<TPayload> => {
  const raw = payload;

  if (!isRecord(payload)) {
    throw new FoundryMcpError(
      "Foundry structured data response is malformed.",
      "INVALID_RESPONSE",
      raw
    );
  }

  const datasetValue = toStringValue(payload.dataset);
  const etag = toStringValue(payload.etag);
  const path = toStringValue(payload.path);

  if (!etag || !path) {
    throw new FoundryMcpError(
      "Foundry structured data response is missing required fields.",
      "INVALID_RESPONSE",
      raw
    );
  }

  const validationErrors = toStringArray(payload.validationErrors);
  const warnings = toStringArray(payload.warnings);
  const payloadData = payload.payload;

  return {
    dataset: isFoundryDataset(datasetValue) ? datasetValue : requestedDataset,
    version: toStringValue(payload.version) ?? null,
    generatedAt: toStringValue(payload.generatedAt) ?? null,
    etag,
    matched: payload.matched === true,
    payloadIncluded: payload.payloadIncluded === true,
    path,
    manifestPath: toStringValue(payload.manifestPath) ?? null,
    sizeBytes:
      typeof payload.sizeBytes === "number" && Number.isFinite(payload.sizeBytes)
        ? payload.sizeBytes
        : 0,
    schemaValidated: payload.schemaValidated === true,
    validationErrors: validationErrors.length ? validationErrors : undefined,
    warnings: warnings.length ? warnings : undefined,
    meta: isRecord(payload.meta) ? payload.meta : undefined,
    payload:
      payloadData !== undefined
        ? (payloadData as TPayload)
        : undefined,
    raw,
  };
};

const DEFAULT_REPL_DSL_VERSION = "2025.11";

const coerceUiSchema = (value: unknown): unknown => {
  if (!isRecord(value)) {
    return value;
  }

  const version = toStringValue(value.version);
  const screens = value.screens;

  if (version && Array.isArray(screens)) {
    return value;
  }

  if (!version && Array.isArray(screens)) {
    return { ...value, version: DEFAULT_REPL_DSL_VERSION };
  }

  const component = toStringValue(value.component);
  if (!component) {
    return value;
  }

  const element: Record<string, unknown> = {
    id: toStringValue(value.id) ?? "screen-1",
    component,
  };

  for (const key of [
    "route",
    "layout",
    "style",
    "props",
    "bindings",
    "children",
    "meta",
  ]) {
    if (key in value) {
      element[key] = value[key];
    }
  }

  return {
    version: DEFAULT_REPL_DSL_VERSION,
    screens: [element],
  };
};

const normalizeReplToolArgs = (
  value: unknown,
  options?: { defaultApply?: boolean }
): Record<string, unknown> => {
  const withApplyDefault = (args: Record<string, unknown>) => {
    if (options?.defaultApply === undefined || "apply" in args) {
      return args;
    }
    return {
      ...args,
      apply: options.defaultApply,
    };
  };

  if (isRecord(value)) {
    const mode = toStringValue(value.mode);
    if (
      mode === "full" ||
      mode === "patch" ||
      "patch" in value ||
      "baseTree" in value ||
      "options" in value
    ) {
      return withApplyDefault(value);
    }
  }

  return withApplyDefault({
    mode: "full",
    schema: coerceUiSchema(value),
  });
};

export const createFoundryMcpClient = (
  options: FoundryMcpClientOptions = {}
): FoundryMcpClient => {
  const baseUrl = options.baseUrl ?? readFoundryMcpBaseUrl();
  if (!baseUrl) {
    throw new FoundryMcpError(
      "Foundry MCP base URL is not configured.",
      "MISSING_BASE_URL"
    );
  }
  const endpoint = normalizeFoundryMcpEndpoint(baseUrl);

  const fetcher = resolveFetch(options.fetcher);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryOptions = options.retry ?? {};

  const callTool = async <T>(
    name: string,
    args: Record<string, unknown>
  ): Promise<T> => {
    const { signal, cleanup } = createTimeoutSignal(timeoutMs);
    try {
      const response = await fetcher(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body:
          endpoint.transport === "bridge"
            ? JSON.stringify({
                tool: name,
                input: args,
              })
            : JSON.stringify({
                jsonrpc: "2.0",
                id: createRequestId(),
                method: "tools.call",
                params: {
                  name,
                  arguments: args,
                },
              }),
        signal,
      });

      if (!response.ok) {
        const parsed = await parseHttpError(response);
        throw new FoundryMcpError(
          parsed.message,
          "NETWORK_ERROR",
          parsed.data
        );
      }

      const payload = await parseResponseBody(response);

      if (endpoint.transport === "bridge") {
        if (isRecord(payload) && isRecord(payload.error)) {
          throw new FoundryMcpError(
            toStringValue(payload.error.message) || "Foundry bridge tool error.",
            "TOOL_ERROR",
            payload.error
          );
        }
        if (isRecord(payload) && payload.ok === false) {
          throw new FoundryMcpError(
            toStringValue(payload.message) || "Foundry bridge request failed.",
            "TOOL_ERROR",
            payload
          );
        }
        const bridgeResult =
          isRecord(payload) && "result" in payload ? payload.result : payload;
        return bridgeResult as T;
      }

      const rpcPayload = isRecord(payload)
        ? (payload as McpToolResponse)
        : ({ result: payload } as McpToolResponse);

      if (rpcPayload.error) {
        throw new FoundryMcpError(
          rpcPayload.error.message || "Foundry MCP tool error.",
          "TOOL_ERROR",
          rpcPayload.error.data
        );
      }

      return extractToolPayload(rpcPayload.result ?? payload) as T;
    } catch (error) {
      if (error instanceof FoundryMcpError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new FoundryMcpError("Foundry MCP request timed out.", "TIMEOUT");
      }
      throw new FoundryMcpError(
        "Foundry MCP request failed to connect.",
        "CONNECTION_FAILED",
        error
      );
    } finally {
      cleanup();
    }
  };

  return {
    async render(schema: unknown) {
      return addBreadcrumb(
        () =>
          retryWithBackoff(async () => {
            const payload = await callTool<unknown>(
              "repl.render",
              normalizeReplToolArgs(schema, { defaultApply: true })
            );
            return normalizeRenderOutput(payload);
          }, retryOptions),
        "rendering design schema via Foundry"
      );
    },
    async validate(schema: unknown) {
      return addBreadcrumb(
        () =>
          retryWithBackoff(async () => {
            const payload = await callTool<unknown>(
              "repl.validate",
              normalizeReplToolArgs(schema)
            );
            return normalizeValidateOutput(payload);
          }, retryOptions),
        "validating design schema via Foundry"
      );
    },
    async buildTokens(brand: unknown, theme?: unknown) {
      return addBreadcrumb(
        () =>
          retryWithBackoff(async () => {
            const payload = await callTool<unknown>("tokens.build", {
              brand,
              theme,
            });
            return normalizeTokenBuildOutput(payload);
          }, retryOptions),
        "building design tokens via Foundry"
      );
    },
    async fetchStructuredData<TPayload = Record<string, unknown>>(
      dataset: FoundryStructuredDataset,
      options?: {
        ifNoneMatch?: string;
        includePayload?: boolean;
      }
    ) {
      return addBreadcrumb(
        () =>
          retryWithBackoff(async () => {
            const payload = await callTool<unknown>("structuredData.fetch", {
              dataset,
              ifNoneMatch: options?.ifNoneMatch,
              includePayload: options?.includePayload,
            });
            return normalizeStructuredDataOutput<TPayload>(dataset, payload);
          }, retryOptions),
        `fetching Foundry structured dataset "${dataset}"`
      );
    },
  };
};

let cachedFoundryClient: FoundryMcpClient | null = null;

const shouldReconnectFoundryClient = (error: unknown) => {
  const code = isRecord(error) ? toStringValue(error.code) : undefined;
  return (
    code === "CONNECTION_FAILED" ||
    code === "NETWORK_ERROR" ||
    code === "TIMEOUT"
  );
};

const getOrCreateFoundryClient = () => {
  if (!cachedFoundryClient) {
    cachedFoundryClient = createFoundryMcpClient();
  }
  return cachedFoundryClient;
};

export const getFoundryMcpClient = () => {
  const executeWithRecovery = async <T>(
    operation: (client: FoundryMcpClient) => Promise<T>
  ) => {
    const activeClient = getOrCreateFoundryClient();
    try {
      return await operation(activeClient);
    } catch (error) {
      if (!shouldReconnectFoundryClient(error)) {
        throw error;
      }

      cachedFoundryClient = createFoundryMcpClient();
      return operation(cachedFoundryClient);
    }
  };

  return {
    render: (schema: unknown) =>
      executeWithRecovery((client) => client.render(schema)),
    validate: (schema: unknown) =>
      executeWithRecovery((client) => client.validate(schema)),
    buildTokens: (brand: unknown, theme?: unknown) =>
      executeWithRecovery((client) => client.buildTokens(brand, theme)),
    fetchStructuredData: <TPayload = Record<string, unknown>>(
      dataset: FoundryStructuredDataset,
      options?: {
        ifNoneMatch?: string;
        includePayload?: boolean;
      }
    ) =>
      executeWithRecovery((client) =>
        client.fetchStructuredData<TPayload>(dataset, options)
      ),
  };
};

export const resetFoundryMcpClient = () => {
  cachedFoundryClient = null;
};
