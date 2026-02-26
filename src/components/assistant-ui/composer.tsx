"use client";

import { ComposerPrimitive, useAssistantState } from "@assistant-ui/react";
import { Send, Square } from "lucide-react";

import { cn } from "@/lib/utils";
import { WORKBENCH_COMPOSER_INPUT_ID } from "@/lib/workbench/keyboard-shortcuts";

export const Composer = () => {
  const canCancel = useAssistantState(({ composer }) => composer.canCancel);
  const isEmpty = useAssistantState(({ composer }) => composer.isEmpty);

  return (
    <ComposerPrimitive.Root className="flex w-full items-end gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <ComposerPrimitive.Input
        id={WORKBENCH_COMPOSER_INPUT_ID}
        aria-label="Workbench composer"
        placeholder="Ask about a Stage1 bundle or plan the next phase..."
        className="min-h-[80px] flex-1 resize-none bg-transparent text-sm text-white/90 outline-none placeholder:text-white/40"
      />
      <div className="flex flex-col gap-2">
        {canCancel ? (
          <ComposerPrimitive.Cancel
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition hover:border-white/60 hover:text-white",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            )}
          >
            <Square className="h-4 w-4" />
          </ComposerPrimitive.Cancel>
        ) : null}
        <ComposerPrimitive.Send
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
            isEmpty && "opacity-50"
          )}
          disabled={isEmpty}
        >
          <Send className="h-4 w-4" />
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
};
