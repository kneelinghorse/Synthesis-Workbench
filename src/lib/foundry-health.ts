/**
 * Pure Foundry bridge health-check logic.
 *
 * Provides a status state machine (unknown → online / offline / timeout)
 * and transition detection for UI notification triggers.
 */

export type FoundryHealthStatus = "unknown" | "online" | "offline" | "timeout";

export type HealthCheckResult = {
  status: "online" | "offline" | "timeout";
  latencyMs: number | null;
};

export type FoundryHealthTransition = {
  previous: FoundryHealthStatus;
  current: FoundryHealthStatus;
  /** True when the bridge went from online → offline/timeout (user should be alerted). */
  wentOffline: boolean;
  /** True when the bridge recovered from offline/timeout → online. */
  recovered: boolean;
};

export type FoundryHealthSnapshot = {
  status: FoundryHealthStatus;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  checkCount: number;
};

const HEALTH_ENDPOINT = "/api/foundry/health";
const HEALTH_TIMEOUT_MS = 4000;

type HealthApiResponse = {
  status: string;
  latencyMs?: number;
  message?: string;
};

/**
 * Pings the Foundry bridge health proxy and returns the result.
 * Pure async function — no side effects, fully testable.
 */
export async function checkFoundryHealth(
  options?: { endpoint?: string; timeoutMs?: number; fetcher?: typeof fetch }
): Promise<HealthCheckResult> {
  const endpoint = options?.endpoint ?? HEALTH_ENDPOINT;
  const timeoutMs = options?.timeoutMs ?? HEALTH_TIMEOUT_MS;
  const fetchFn = options?.fetcher ?? fetch;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetchFn(endpoint, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    const elapsed = Date.now() - start;

    if (response.ok) {
      try {
        const body = (await response.json()) as HealthApiResponse;
        return {
          status: body.status === "online" ? "online" : "offline",
          latencyMs: body.latencyMs ?? elapsed,
        };
      } catch {
        return { status: "online", latencyMs: elapsed };
      }
    }

    return { status: "offline", latencyMs: elapsed };
  } catch (error) {
    const elapsed = Date.now() - start;
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      status: isAbort ? "timeout" : "offline",
      latencyMs: isAbort ? null : elapsed,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Computes the transition between two health statuses.
 */
export function computeTransition(
  previous: FoundryHealthStatus,
  current: FoundryHealthStatus
): FoundryHealthTransition {
  const wasOnline = previous === "online";
  const isNowOffline = current === "offline" || current === "timeout";
  const isNowOnline = current === "online";
  const wasOffline = previous === "offline" || previous === "timeout";

  return {
    previous,
    current,
    wentOffline: wasOnline && isNowOffline,
    recovered: wasOffline && isNowOnline,
  };
}

/**
 * Creates a mutable health state tracker for use in loops or hooks.
 */
export function createHealthTracker(): {
  snapshot: () => FoundryHealthSnapshot;
  record: (result: HealthCheckResult) => FoundryHealthTransition;
  reset: () => void;
} {
  let status: FoundryHealthStatus = "unknown";
  let latencyMs: number | null = null;
  let lastCheckedAt: string | null = null;
  let checkCount = 0;

  return {
    snapshot() {
      return { status, latencyMs, lastCheckedAt, checkCount };
    },
    record(result: HealthCheckResult) {
      const previous = status;
      status = result.status;
      latencyMs = result.latencyMs;
      lastCheckedAt = new Date().toISOString();
      checkCount += 1;
      return computeTransition(previous, result.status);
    },
    reset() {
      status = "unknown";
      latencyMs = null;
      lastCheckedAt = null;
      checkCount = 0;
    },
  };
}
