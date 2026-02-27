"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { FoundryHealthStatus } from "@/lib/foundry-health";
import { cn } from "@/lib/utils";

type FoundryHealthBannerProps = {
  status: FoundryHealthStatus;
  checking: boolean;
  onRetry: () => void;
  className?: string;
};

const BANNER_CONTENT: Record<
  "offline" | "timeout" | "recovered",
  { label: string; message: string; style: string }
> = {
  offline: {
    label: "Foundry Offline",
    message:
      "The Foundry bridge is unreachable. Preview will use static fallback rendering until the connection is restored.",
    style: "border-rose-500/40 bg-rose-500/10 text-rose-100",
  },
  timeout: {
    label: "Foundry Timeout",
    message:
      "The Foundry bridge is not responding in time. Rendering may be degraded.",
    style: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  },
  recovered: {
    label: "Foundry Reconnected",
    message:
      "The Foundry bridge is back online. Live rendering is active.",
    style: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  },
};

/**
 * Banner that slides in when the Foundry bridge transitions to
 * offline/timeout, and briefly shows a recovery message when it comes back.
 */
export const FoundryHealthBanner = ({
  status,
  checking,
  onRetry,
  className,
}: FoundryHealthBannerProps) => {
  const [visible, setVisible] = useState(false);
  const [bannerMode, setBannerMode] = useState<
    "offline" | "timeout" | "recovered" | null
  >(null);
  const previousStatusRef = useRef<FoundryHealthStatus>("unknown");

  useEffect(() => {
    const prev = previousStatusRef.current;
    if (status === prev) {
      return;
    }

    previousStatusRef.current = status;

    const wasOnline = prev === "online";
    const wasOffline = prev === "offline" || prev === "timeout";

    if (status === "offline" || status === "timeout") {
      if (wasOnline) {
        setBannerMode(status);
        setVisible(true);
      }
    } else if (status === "online" && wasOffline) {
      setBannerMode("recovered");
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setBannerMode(null);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      setBannerMode(null);
    }
  }, [status]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setBannerMode(null);
  }, []);

  if (!visible || !bannerMode) {
    return null;
  }

  const content = BANNER_CONTENT[bannerMode];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-xs transition-all duration-300",
        content.style,
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <span className="font-semibold">{content.label}</span>
        <span className="ml-1.5 opacity-85">{content.message}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {bannerMode !== "recovered" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-current/30 bg-transparent text-current hover:bg-white/5"
            onClick={onRetry}
            disabled={checking}
          >
            {checking ? "Checking..." : "Retry"}
          </Button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded p-0.5 text-current opacity-60 hover:opacity-100"
          aria-label="Dismiss"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
};
