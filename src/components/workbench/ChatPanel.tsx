"use client";

import { useRuntimeError, WorkbenchRuntimeProvider } from "@/lib/runtime/RuntimeProvider";
import { cn } from "@/lib/utils";
import { Thread } from "@/components/assistant-ui/thread";

const RuntimeErrorBanner = () => {
  const error = useRuntimeError();

  if (!error) return null;

  return (
    <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
      <div className="font-semibold">{error.message}</div>
      {error.detail ? (
        <div className="mt-1 text-xs text-rose-100/80">{error.detail}</div>
      ) : null}
    </div>
  );
};

const ChatSurface = () => (
  <div className="flex h-full flex-col gap-4">
    <RuntimeErrorBanner />
    <div className="flex-1 rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
      <Thread />
    </div>
  </div>
);

export const ChatPanel = ({ className }: { className?: string }) => (
  <WorkbenchRuntimeProvider>
    <div className={cn("h-full", className)}>
      <ChatSurface />
    </div>
  </WorkbenchRuntimeProvider>
);
