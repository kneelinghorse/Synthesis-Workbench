"use client";

import { ThreadPrimitive } from "@assistant-ui/react";

import { Composer } from "./composer";
import { AssistantMessage, UserMessage } from "./message";

export const Thread = () => (
  <ThreadPrimitive.Root className="flex h-full flex-col">
    <ThreadPrimitive.Viewport className="flex-1 space-y-6 overflow-y-auto px-4 pb-6 pt-4">
      <ThreadPrimitive.Empty>
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-6 text-center text-sm text-white/60">
          Start the conversation by describing your Stage1 bundle or phase goal.
        </div>
      </ThreadPrimitive.Empty>
      <ThreadPrimitive.Messages
        components={{
          UserMessage,
          AssistantMessage,
        }}
      />
      <ThreadPrimitive.ViewportFooter className="sticky bottom-0 pt-4">
        <Composer />
      </ThreadPrimitive.ViewportFooter>
    </ThreadPrimitive.Viewport>
  </ThreadPrimitive.Root>
);
