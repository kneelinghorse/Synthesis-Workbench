"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  checkFoundryHealth,
  createHealthTracker,
  type FoundryHealthStatus,
  type FoundryHealthTransition,
} from "@/lib/foundry-health";
import { usePreviewStateStore } from "@/lib/stores/preview-state";

export type UseFoundryHealthOptions = {
  /** Polling interval in milliseconds. Defaults to 30_000 (30s). */
  intervalMs?: number;
  /** Whether to enable polling. Defaults to true. */
  enabled?: boolean;
  /** Run health check immediately on mount. Defaults to true. */
  checkOnMount?: boolean;
  /** Callback fired when a transition is detected. */
  onTransition?: (transition: FoundryHealthTransition) => void;
};

export type UseFoundryHealthReturn = {
  status: FoundryHealthStatus;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  checkCount: number;
  checking: boolean;
  /** Manually trigger a health check. */
  check: () => Promise<void>;
};

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Reusable hook for monitoring Foundry bridge health.
 *
 * - Pings `/api/foundry/health` on mount and at regular intervals.
 * - Updates the preview state store's foundryStatus when the bridge goes online/offline.
 * - Fires `onTransition` when the status changes, enabling banner/toast notifications.
 */
export function useFoundryHealth(
  options?: UseFoundryHealthOptions
): UseFoundryHealthReturn {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const enabled = options?.enabled ?? true;
  const checkOnMount = options?.checkOnMount ?? true;

  const [status, setStatus] = useState<FoundryHealthStatus>("unknown");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [checkCount, setCheckCount] = useState(0);
  const [checking, setChecking] = useState(false);

  const setFoundryStatus = usePreviewStateStore((s) => s.setFoundryStatus);
  const trackerRef = useRef(createHealthTracker());
  const onTransitionRef = useRef(options?.onTransition);
  onTransitionRef.current = options?.onTransition;

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      const result = await checkFoundryHealth();
      const transition = trackerRef.current.record(result);
      const snap = trackerRef.current.snapshot();

      setStatus(snap.status);
      setLatencyMs(snap.latencyMs);
      setLastCheckedAt(snap.lastCheckedAt);
      setCheckCount(snap.checkCount);

      // Sync to preview state store so FoundryStatusChip stays accurate.
      if (result.status === "online") {
        setFoundryStatus("live");
      } else {
        setFoundryStatus("offline");
      }

      if (transition.previous !== "unknown" && transition.previous !== transition.current) {
        onTransitionRef.current?.(transition);
      }
    } finally {
      setChecking(false);
    }
  }, [setFoundryStatus]);

  // Initial check on mount.
  useEffect(() => {
    if (enabled && checkOnMount) {
      void runCheck();
    }
  }, [enabled, checkOnMount, runCheck]);

  // Interval polling.
  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return;
    }

    const id = setInterval(() => {
      void runCheck();
    }, intervalMs);

    return () => clearInterval(id);
  }, [enabled, intervalMs, runCheck]);

  return {
    status,
    latencyMs,
    lastCheckedAt,
    checkCount,
    checking,
    check: runCheck,
  };
}
