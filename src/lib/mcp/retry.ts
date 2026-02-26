/**
 * MCP retry, error advice, and breadcrumb utilities.
 *
 * - retryWithBackoff: wraps an async operation with configurable exponential backoff
 *   for transient failures (TIMEOUT, NETWORK_ERROR, CONNECTION_FAILED).
 * - getErrorAdvice: returns actionable advice for known MCP error codes.
 * - addBreadcrumb: annotates errors with operation context so users know
 *   what was happening when the error occurred.
 */

export type McpErrorLike = Error & {
  code?: string;
  breadcrumb?: string;
  advice?: string;
};

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  retryableCodes?: Set<string>;
  onRetry?: (attempt: number, error: McpErrorLike) => void;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

export const RETRYABLE_CODES = new Set([
  "TIMEOUT",
  "NETWORK_ERROR",
  "CONNECTION_FAILED",
]);

const ERROR_ADVICE: Record<string, string> = {
  TIMEOUT:
    "The server did not respond in time. Check that it is running and responsive.",
  CONNECTION_FAILED:
    "Could not connect to the server. Verify the URL and network connectivity.",
  MISSING_BASE_URL:
    "Server URL is not configured. Set the appropriate environment variable in .env.local.",
  INVALID_URL:
    "Server URL is invalid. Use a full URL such as http://127.0.0.1:4466/run.",
  INVALID_RESPONSE:
    "Server response was malformed. Verify tool compatibility and server version.",
  NETWORK_ERROR:
    "The server returned an error response. It may be overloaded or restarting.",
  NO_FETCH:
    "No fetch implementation available. Ensure you are in a browser environment or provide a fetcher.",
  NOT_FOUND:
    "The requested resource was not found on the server.",
  TOOL_ERROR:
    "The MCP tool returned an error. Check the tool arguments and server logs.",
  MISSING_HTML:
    "The render response did not include HTML output. The schema may be invalid.",
};

export const getErrorAdvice = (code: string | undefined): string | null => {
  if (!code) return null;
  return ERROR_ADVICE[code] ?? null;
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const retryableCodes = options.retryableCodes ?? RETRYABLE_CODES;
  const onRetry = options.onRetry;

  let lastError: McpErrorLike | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const mcpError = error as McpErrorLike;
      lastError = mcpError;

      const isRetryable =
        mcpError.code != null && retryableCodes.has(mcpError.code);
      if (!isRetryable || attempt >= maxAttempts) {
        throw mcpError;
      }

      onRetry?.(attempt, mcpError);
      await delay(baseDelayMs * Math.pow(2, attempt - 1));
    }
  }

  throw lastError!;
};

export const addBreadcrumb = async <T>(
  fn: () => Promise<T>,
  breadcrumb: string
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    const mcpError = error as McpErrorLike;
    mcpError.breadcrumb = breadcrumb;
    const advice = getErrorAdvice(mcpError.code);
    if (advice) {
      mcpError.advice = advice;
    }
    throw mcpError;
  }
};
