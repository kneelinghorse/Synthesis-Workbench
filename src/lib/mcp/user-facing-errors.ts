import type { McpErrorLike } from "./retry";

export type McpService = "stage1" | "foundry";

type FormatMcpServiceErrorOptions = {
  operation?: string;
};

type ServiceConfig = {
  label: string;
  startupHint: string;
  envHint: string;
  logsHint: string;
};

const SERVICE_CONFIG: Record<McpService, ServiceConfig> = {
  stage1: {
    label: "Stage1 MCP",
    startupHint: "Make sure the Stage1 MCP bridge is running.",
    envHint:
      "Verify NEXT_PUBLIC_STAGE1_MCP_URL or STAGE1_MCP_URL is set correctly.",
    logsHint: "Check Stage1 MCP bridge logs for the failing request.",
  },
  foundry: {
    label: "Foundry MCP",
    startupHint: "Make sure the Foundry MCP bridge is running.",
    envHint:
      "Verify NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL or OODS_FOUNDRY_MCP_URL is set correctly.",
    logsHint: "Check Foundry MCP bridge logs for the failing request.",
  },
};

type ErrorWithData = McpErrorLike & {
  data?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const withOperation = (operation: string | undefined) =>
  operation ? ` while ${operation}` : "";

const readCode = (error: unknown): string | undefined =>
  isRecord(error) && typeof error.code === "string" ? error.code : undefined;

const readMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const truncate = (value: string, max = 180) =>
  value.length <= max ? value : `${value.slice(0, max - 3)}...`;

const extractDetail = (message: string): string | null => {
  const withoutPrefix = message.includes(":")
    ? message.slice(message.indexOf(":") + 1)
    : message;
  const cleaned = withoutPrefix
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? truncate(cleaned) : null;
};

const readHttpStatus = (error: ErrorWithData, message: string): number | null => {
  if (isRecord(error.data) && typeof error.data.status === "number") {
    return error.data.status;
  }

  const statusMatch = message.match(/\((\d{3})\)/);
  if (!statusMatch) {
    return null;
  }

  const parsed = Number.parseInt(statusMatch[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatMcpServiceError = (
  service: McpService,
  error: unknown,
  options: FormatMcpServiceErrorOptions = {}
): string => {
  const config = SERVICE_CONFIG[service];
  const operationSuffix = withOperation(options.operation);

  if (!(error instanceof Error)) {
    return `${config.label} request failed${operationSuffix}. ${config.startupHint} ${config.envHint}`;
  }

  const mcpError = error as ErrorWithData;
  const code = readCode(mcpError);
  const message = readMessage(mcpError);

  switch (code) {
    case "MISSING_BASE_URL":
    case "INVALID_URL":
      return `${config.label} is not configured correctly${operationSuffix}. ${config.envHint}`;
    case "CONNECTION_FAILED":
    case "TIMEOUT":
      return `${config.label} is unreachable${operationSuffix}. ${config.startupHint} ${config.envHint}`;
    case "NETWORK_ERROR": {
      const status = readHttpStatus(mcpError, message);
      const statusLabel = status ? `HTTP ${status}` : "an HTTP error";
      return `${config.label} returned ${statusLabel}${operationSuffix}. ${config.logsHint} ${config.startupHint}`;
    }
    case "TOOL_ERROR": {
      const detail = extractDetail(message);
      return detail
        ? `${config.label} returned a tool error${operationSuffix}: ${detail}. ${config.logsHint}`
        : `${config.label} returned a tool error${operationSuffix}. ${config.logsHint}`;
    }
    case "NOT_FOUND":
      if (service === "stage1") {
        return `${config.label} could not find the requested artifact${operationSuffix}. Re-run Stage1 inspection and retry.`;
      }
      return `${config.label} could not find the requested resource${operationSuffix}. ${config.logsHint}`;
    case "MISSING_HTML":
      return `${config.label} returned no HTML output${operationSuffix}. Validate the schema and retry.`;
    default: {
      const detail = extractDetail(message);
      const detailSuffix = detail ? ` Details: ${detail}.` : "";
      return `${config.label} request failed${operationSuffix}. ${config.startupHint} ${config.envHint}${detailSuffix}`;
    }
  }
};
