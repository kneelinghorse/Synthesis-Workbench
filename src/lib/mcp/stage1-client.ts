import { addBreadcrumb, retryWithBackoff, type RetryOptions } from "./retry";

export type Stage1RunSummary = {
  runId: string;
  hostname: string;
  timestamp?: string;
  runDir?: string;
  projectId?: string;
  mode?: string;
  targetCount?: number;
};

export type Stage1ListRunsResult = {
  runs: Stage1RunSummary[];
  message?: string;
};

export type Stage1InspectAppArgs = {
  url: string;
  name?: string;
  outDir?: string;
  crawlDepth?: number;
  include?: string[];
  components?: boolean;
  repoPath?: string;
  seedRoutes?: string[];
  authStorageStatePath?: string;
  api?: {
    baseUrl: string;
    type?: string;
    graphqlEndpoint?: string;
    auth?: {
      type: string;
      credentials: Record<string, unknown>;
    };
  };
};

export type Stage1InspectSurfaceArgs = {
  url: string;
  name?: string;
  outDir?: string;
  passes?: string[];
  seedRoutes?: string[];
};

export type Stage1InspectionResult = {
  run: Stage1RunSummary | null;
  payload: unknown;
  message?: string;
};

export type Stage1McpClient = {
  listRuns: () => Promise<Stage1RunSummary[]>;
  getArtifact: <T = unknown>(runDir: string, artifactName: string) => Promise<T>;
  inspectApp: (args: Stage1InspectAppArgs) => Promise<Stage1InspectionResult>;
  inspectSurface: (
    args: Stage1InspectSurfaceArgs
  ) => Promise<Stage1InspectionResult>;
};

export type Stage1McpClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  retry?: RetryOptions;
};

type McpToolResponse = {
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

class Stage1McpError extends Error {
  code?: string;
  data?: unknown;

  constructor(message: string, code?: string, data?: unknown) {
    super(message);
    this.name = "Stage1McpError";
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
  throw new Stage1McpError(
    "Stage1 MCP client requires a fetch implementation.",
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
  return `stage1-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const parseStage1RunDir = (value: string | undefined) => {
  if (!value) {
    return { runId: undefined, hostname: undefined };
  }
  const parts = value.split(/[/\\]+/).filter(Boolean);
  const runId = parts.at(-1);
  const hostname = parts.length > 1 ? parts.at(-2) : undefined;
  return { runId, hostname };
};

const parseHostnameFromUrl = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).hostname || undefined;
  } catch {
    return undefined;
  }
};

const normalizeRunEntry = (entry: Record<string, unknown>): Stage1RunSummary | null => {
  const runDir =
    toStringValue(entry.runDir) ??
    toStringValue(entry.run_dir) ??
    toStringValue(entry.outputDir) ??
    toStringValue(entry.output_dir) ??
    toStringValue(entry.outDir) ??
    toStringValue(entry.out_dir) ??
    toStringValue(entry.path);
  const parsedFromDir = parseStage1RunDir(runDir);

  const runId =
    toStringValue(entry.runId) ??
    toStringValue(entry.run_id) ??
    toStringValue(entry.id) ??
    parsedFromDir.runId;
  const hostname =
    toStringValue(entry.hostname) ??
    toStringValue(entry.host) ??
    toStringValue(entry.target) ??
    toStringValue(entry.targetHost) ??
    toStringValue(entry.target_host) ??
    toStringValue(entry.targetName) ??
    toStringValue(entry.target_name) ??
    toStringValue(entry.name) ??
    parseHostnameFromUrl(
      toStringValue(entry.url) ??
        toStringValue(entry.targetUrl) ??
        toStringValue(entry.target_url)
    ) ??
    parsedFromDir.hostname;
  const timestamp =
    toStringValue(entry.timestamp) ??
    toStringValue(entry.generated_at) ??
    toStringValue(entry.created_at) ??
    toStringValue(entry.started_at) ??
    toStringValue(entry.time);

  if (!runId || !hostname) {
    return null;
  }

  const projectId =
    toStringValue(entry.projectId) ??
    toStringValue(entry.project_id);
  const mode =
    toStringValue(entry.mode);
  const rawTargetCount = entry.targetCount ?? entry.target_count;
  const targetCount =
    typeof rawTargetCount === "number" && Number.isFinite(rawTargetCount)
      ? rawTargetCount
      : undefined;

  return {
    runId,
    hostname,
    timestamp,
    runDir,
    projectId,
    mode,
    targetCount,
  };
};

const extractFirstRunFromList = (payload: unknown) => {
  const runs = extractRuns(payload);
  if (!runs.length) {
    return null;
  }

  return [...runs].sort((left, right) => {
    const leftTime = left.timestamp ? Date.parse(left.timestamp) : 0;
    const rightTime = right.timestamp ? Date.parse(right.timestamp) : 0;
    return rightTime - leftTime;
  })[0] ?? null;
};

const extractInspectionRun = (
  payload: unknown,
  depth = 0
): Stage1RunSummary | null => {
  if (depth > 2) {
    return null;
  }

  if (isRecord(payload)) {
    const normalized = normalizeRunEntry(payload);
    if (normalized) {
      return normalized;
    }

    const nestedKeys = ["run", "summary", "payload", "data", "result"] as const;
    for (const key of nestedKeys) {
      const nested = payload[key];
      if (!nested) {
        continue;
      }
      const match = extractInspectionRun(nested, depth + 1);
      if (match) {
        return match;
      }
    }
  }

  return extractFirstRunFromList(payload);
};

const extractInspectionMessage = (payload: unknown): string | undefined => {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (!isRecord(payload)) {
    return undefined;
  }

  const direct =
    toStringValue(payload.message) ??
    toStringValue(payload.detail) ??
    toStringValue(payload.status);
  if (direct) {
    return direct;
  }

  if (isRecord(payload.error)) {
    return toStringValue(payload.error.message);
  }

  return undefined;
};

const normalizeInspectionResult = (payload: unknown): Stage1InspectionResult => ({
  run: extractInspectionRun(payload),
  payload,
  message: extractInspectionMessage(payload),
});

const extractRuns = (payload: unknown): Stage1RunSummary[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const runs =
    (Array.isArray(payload.runs) && payload.runs) ||
    (Array.isArray(payload.items) && payload.items) ||
    (Array.isArray(payload.data) && payload.data) ||
    [];

  return runs
    .map((entry) => (isRecord(entry) ? normalizeRunEntry(entry) : null))
    .filter((entry): entry is Stage1RunSummary => Boolean(entry));
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
      if (!isRecord(entry)) {
        continue;
      }
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

const extractArtifactPayload = (payload: unknown): unknown => {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (!isRecord(payload)) {
    return payload;
  }

  if ("artifact" in payload) {
    return payload.artifact;
  }
  if ("payload" in payload) {
    return payload.payload;
  }
  if ("data" in payload) {
    return payload.data;
  }

  return payload;
};

const looksLikeMissingArtifactMessage = (value: string) =>
  /not found|missing/i.test(value);

const isMissingArtifact = (payload: unknown) => {
  if (payload === null || payload === undefined) {
    return true;
  }
  if (typeof payload === "string") {
    return looksLikeMissingArtifactMessage(payload);
  }
  if (isRecord(payload)) {
    const candidates = [
      toStringValue(payload.message),
      toStringValue(payload.error),
      toStringValue(payload.detail),
      toStringValue(payload.details),
      toStringValue(payload.reason),
      toStringValue(payload.artifact),
      isRecord(payload.error) ? toStringValue(payload.error.message) : undefined,
    ];

    if (
      candidates.some(
        (candidate) =>
          typeof candidate === "string" &&
          looksLikeMissingArtifactMessage(candidate)
      )
    ) {
      return true;
    }
  }
  return false;
};

const isBrowserRuntime = () =>
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  process.env.NODE_ENV !== "test";

const readStage1McpBaseUrl = () => {
  const explicit =
    process.env.NEXT_PUBLIC_STAGE1_MCP_URL?.trim() ||
    process.env.STAGE1_MCP_URL?.trim();

  if (isBrowserRuntime()) {
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

    // Route through the Next.js proxy to avoid CORS issues.
    return "/api/stage1/mcp";
  }

  return explicit;
};

const normalizeStage1McpBaseUrl = (value: string) => {
  // Relative paths are valid same-origin proxy routes (e.g. "/api/stage1/mcp").
  // Pass through without new URL() validation — the browser fetch API handles them.
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/mcp";
    }
    return parsed.toString();
  } catch {
    throw new Stage1McpError(
      `Stage1 MCP base URL is invalid: ${value}`,
      "INVALID_URL",
      value
    );
  }
};

const parseHttpError = async (response: Response) => {
  const bodyText = await response.text().catch(() => "");
  const parsedBody =
    typeof bodyText === "string" && bodyText.trim().length > 0
      ? safeJsonParse(bodyText)
      : null;

  const messageFromBody =
    (isRecord(parsedBody) &&
      (toStringValue(parsedBody.message) ||
        (isRecord(parsedBody.error) && toStringValue(parsedBody.error.message)))) ||
    (typeof bodyText === "string" && bodyText.trim().length > 0 ? truncate(bodyText.trim()) : "");

  const details = messageFromBody ? `: ${messageFromBody}` : "";
  return {
    message: `Stage1 MCP request failed (${response.status}) at ${response.url}${details}`,
    data: {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      body: parsedBody ?? (bodyText || null),
    },
  };
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const bodyText = await response.text().catch(() => "");
  if (!bodyText || bodyText.trim().length === 0) {
    return null;
  }
  return safeJsonParse(bodyText);
};

export const createStage1McpClient = (
  options: Stage1McpClientOptions = {}
): Stage1McpClient => {
  const baseUrl = options.baseUrl ?? readStage1McpBaseUrl();
  if (!baseUrl) {
    throw new Stage1McpError(
      "Stage1 MCP base URL is not configured.",
      "MISSING_BASE_URL"
    );
  }
  const endpointUrl = normalizeStage1McpBaseUrl(baseUrl);

  const fetcher = resolveFetch(options.fetcher);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryOptions = options.retry ?? {};

  const callTool = async <T>(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<T> => {
    const { signal, cleanup } = createTimeoutSignal(timeoutMs);
    try {
      const response = await fetcher(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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
        throw new Stage1McpError(
          parsed.message,
          "NETWORK_ERROR",
          parsed.data
        );
      }

      const parsedPayload = await parseResponseBody(response);
      const payload = isRecord(parsedPayload)
        ? (parsedPayload as McpToolResponse)
        : ({ result: parsedPayload } as McpToolResponse);

      if (isRecord(payload.error)) {
        throw new Stage1McpError(
          payload.error.message || "Stage1 MCP tool error.",
          "TOOL_ERROR",
          payload.error.data
        );
      }

      return extractToolPayload(payload.result ?? payload) as T;
    } catch (error) {
      if (error instanceof Stage1McpError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new Stage1McpError("Stage1 MCP request timed out.", "TIMEOUT");
      }
      throw new Stage1McpError(
        "Stage1 MCP request failed to connect.",
        "CONNECTION_FAILED",
        error
      );
    } finally {
      cleanup();
    }
  };

  return {
    async listRuns() {
      return addBreadcrumb(
        () =>
          retryWithBackoff(async () => {
            const payload = await callTool<unknown>("stage1_list_runs");
            return extractRuns(payload);
          }, retryOptions),
        "listing Stage1 runs"
      );
    },
    async getArtifact<T = unknown>(runDir: string, artifactName: string) {
      return addBreadcrumb(
        () =>
          retryWithBackoff(async () => {
            const payload = await callTool<unknown>("stage1_get_artifact", {
              runDir,
              artifactName,
            });
            if (isMissingArtifact(payload)) {
              throw new Stage1McpError(
                `Stage1 artifact missing: ${artifactName}`,
                "NOT_FOUND"
              );
            }
            return extractArtifactPayload(payload) as T;
          }, retryOptions),
        `loading artifact ${artifactName} from run ${runDir.split("/").pop() ?? runDir}`
      );
    },
    async inspectApp(args: Stage1InspectAppArgs) {
      return addBreadcrumb(
        () =>
          retryWithBackoff(async () => {
            const payload = await callTool<unknown>("stage1_inspect_app", args);
            return normalizeInspectionResult(payload);
          }, retryOptions),
        `running inspect_app for ${args.url}`
      );
    },
    async inspectSurface(args: Stage1InspectSurfaceArgs) {
      return addBreadcrumb(
        () =>
          retryWithBackoff(async () => {
            const payload = await callTool<unknown>("stage1_inspect_surface", args);
            return normalizeInspectionResult(payload);
          }, retryOptions),
        `running inspect_surface for ${args.url}`
      );
    },
  };
};

let cachedStage1Client: Stage1McpClient | null = null;

const shouldReconnectStage1Client = (error: unknown) => {
  const code = isRecord(error) ? toStringValue(error.code) : undefined;
  return (
    code === "CONNECTION_FAILED" ||
    code === "NETWORK_ERROR" ||
    code === "TIMEOUT"
  );
};

const getOrCreateStage1Client = () => {
  if (!cachedStage1Client) {
    cachedStage1Client = createStage1McpClient();
  }
  return cachedStage1Client;
};

export const getStage1McpClient = () => {
  const executeWithRecovery = async <T>(
    operation: (client: Stage1McpClient) => Promise<T>
  ) => {
    const activeClient = getOrCreateStage1Client();
    try {
      return await operation(activeClient);
    } catch (error) {
      if (!shouldReconnectStage1Client(error)) {
        throw error;
      }

      cachedStage1Client = createStage1McpClient();
      return operation(cachedStage1Client);
    }
  };

  return {
    listRuns: () => executeWithRecovery((client) => client.listRuns()),
    getArtifact: <T = unknown>(runDir: string, artifactName: string) =>
      executeWithRecovery((client) => client.getArtifact<T>(runDir, artifactName)),
    inspectApp: (args: Stage1InspectAppArgs) =>
      executeWithRecovery((client) => client.inspectApp(args)),
    inspectSurface: (args: Stage1InspectSurfaceArgs) =>
      executeWithRecovery((client) => client.inspectSurface(args)),
  };
};

export const resetStage1McpClient = () => {
  cachedStage1Client = null;
};
