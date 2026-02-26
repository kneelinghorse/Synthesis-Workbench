"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/workbench/ChatPanel";
import { FirstRunOnboarding } from "@/components/workbench/FirstRunOnboarding";
import { PreviewPanel } from "@/components/workbench/PreviewPanel";
import { ProjectBrowser } from "@/components/workbench/ProjectBrowser";
import { TemplateBrowser } from "@/components/workbench/TemplateBrowser";
import { usePhaseStore } from "@/lib/stores/phase-state";
import { cn } from "@/lib/utils";
import {
  SHORTCUT_COMMANDS,
  WORKBENCH_SHORTCUT_HELP,
  isEditableEventTarget,
  resolveWorkbenchShortcutAction,
  writeCommandToComposer,
} from "@/lib/workbench/keyboard-shortcuts";
import { DEFAULT_PHASES } from "@/types/phase";

type ShortcutNoticeTone = "info" | "warning";

type ShortcutNotice = {
  message: string;
  tone: ShortcutNoticeTone;
};

const NOTICE_STYLE: Record<ShortcutNoticeTone, string> = {
  info: "border-white/20 bg-white/10 text-white/85",
  warning: "border-amber-400/40 bg-amber-500/15 text-amber-100",
};

export const ChatWorkbenchShell = () => {
  const currentPhase = usePhaseStore((state) => state.currentPhase);
  const workflowMode = usePhaseStore((state) => state.workflowMode);
  const setWorkflowMode = usePhaseStore((state) => state.setWorkflowMode);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shortcutNotice, setShortcutNotice] = useState<ShortcutNotice | null>(
    null
  );
  const noticeTimerRef = useRef<number | null>(null);

  const clearNoticeTimer = useCallback(() => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  }, []);

  const showNotice = useCallback(
    (message: string, tone: ShortcutNoticeTone = "info") => {
      clearNoticeTimer();
      setShortcutNotice({ message, tone });
      noticeTimerRef.current = window.setTimeout(() => {
        setShortcutNotice(null);
        noticeTimerRef.current = null;
      }, 2600);
    },
    [clearNoticeTimer]
  );

  useEffect(
    () => () => {
      clearNoticeTimer();
    },
    [clearNoticeTimer]
  );

  const transitionPhaseBy = useCallback(
    (direction: 1 | -1) => {
      const { currentPhase, transitionTo } = usePhaseStore.getState();
      const currentIndex = DEFAULT_PHASES.findIndex(
        (phase) => phase.id === currentPhase
      );
      if (currentIndex === -1) {
        showNotice("Current phase is unknown. Transition skipped.", "warning");
        return;
      }

      const nextIndex = currentIndex + direction;
      const nextPhase = DEFAULT_PHASES[nextIndex];

      if (!nextPhase) {
        showNotice(
          direction > 0
            ? "Already at the final phase."
            : "Already at the first phase.",
          "warning"
        );
        return;
      }

      const assessment = transitionTo(nextPhase.id, DEFAULT_PHASES);
      if (assessment.allowed) {
        showNotice(`Phase changed: ${nextPhase.label}.`);
        return;
      }

      showNotice(
        assessment.blockers[0] ?? "Phase transition blocked by guardrails.",
        "warning"
      );
    },
    [showNotice]
  );

  const phaseLabel = useMemo(() => {
    return (
      DEFAULT_PHASES.find((phase) => phase.id === currentPhase)?.label ??
      currentPhase
    );
  }, [currentPhase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveWorkbenchShortcutAction(
        event,
        isEditableEventTarget(event.target)
      );
      if (!action) {
        return;
      }

      event.preventDefault();

      if (action.type === "toggle-help") {
        setHelpOpen((open) => !open);
        return;
      }

      if (action.type === "close-help") {
        setHelpOpen(false);
        return;
      }

      if (action.type === "phase-step") {
        transitionPhaseBy(action.direction);
        return;
      }

      if (action.type === "toggle-preview") {
        setPreviewVisible((visible) => {
          const next = !visible;
          showNotice(next ? "Preview panel shown." : "Preview panel hidden.");
          return next;
        });
        return;
      }

      if (action.type === "insert-command") {
        const command = SHORTCUT_COMMANDS[action.commandId];
        const wrote = writeCommandToComposer(command);
        showNotice(
          wrote
            ? `Inserted command: ${command}`
            : "Composer input is unavailable for command insertion.",
          wrote ? "info" : "warning"
        );
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showNotice, transitionPhaseBy]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0c0f] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_at_15%_0%,rgba(95,167,150,0.16),transparent_60%),radial-gradient(900px_at_85%_15%,rgba(214,168,94,0.18),transparent_60%)]" />
      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10 sm:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">
              Workbench Runtime
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              LocalRuntime Chat Surface
            </h1>
            <p className="mt-2 text-xs text-white/55">
              Active phase: {phaseLabel}. Workflow mode: {workflowMode}. Press{" "}
              <span className="font-semibold">?</span> for keyboard shortcuts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-white/20 bg-black/30 p-0.5 text-xs">
              <button
                type="button"
                className={cn(
                  "rounded-md px-2 py-1 transition",
                  workflowMode === "strict"
                    ? "bg-white text-black"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
                onClick={() => {
                  setWorkflowMode("strict");
                  showNotice("Workflow mode set to strict.");
                }}
              >
                Strict
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-2 py-1 transition",
                  workflowMode === "flexible"
                    ? "bg-white text-black"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
                onClick={() => {
                  setWorkflowMode("flexible");
                  showNotice("Workflow mode set to flexible.");
                }}
              >
                Flexible
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-white/30 bg-white/5 text-white hover:bg-white/10"
              onClick={() => setPreviewVisible((visible) => !visible)}
            >
              {previewVisible ? "Hide Preview" : "Show Preview"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/30 bg-white/5 text-white hover:bg-white/10"
              onClick={() => setHelpOpen(true)}
            >
              Shortcuts
            </Button>
            <Button
              variant="outline"
              className="border-white/30 bg-white/5 text-white"
              asChild
            >
              <Link href="/">Back to Overview</Link>
            </Button>
          </div>
        </header>

        {shortcutNotice ? (
          <div
            role="status"
            className={cn(
              "rounded-xl border px-3 py-2 text-xs",
              NOTICE_STYLE[shortcutNotice.tone]
            )}
          >
            {shortcutNotice.message}
          </div>
        ) : null}

        <FirstRunOnboarding />
        <ProjectBrowser />
        <TemplateBrowser />

        <section
          className={cn(
            "grid flex-1 gap-6",
            previewVisible ? "lg:grid-cols-[1.1fr_0.9fr]" : "lg:grid-cols-1"
          )}
        >
          <ChatPanel className="min-h-[480px] lg:min-h-0" />
          {previewVisible ? (
            <PreviewPanel className="min-h-[480px] lg:min-h-0" />
          ) : null}
        </section>
      </main>

      {helpOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#11131a] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Keyboard Shortcuts
                </h2>
                <p className="mt-1 text-xs text-white/60">
                  Power-user controls for phase navigation and command launch.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                onClick={() => setHelpOpen(false)}
              >
                Close
              </Button>
            </div>
            <div className="mt-5 grid gap-2">
              {WORKBENCH_SHORTCUT_HELP.map((entry) => (
                <div
                  key={`${entry.keys}-${entry.description}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                >
                  <span className="text-xs text-white/70">{entry.description}</span>
                  <kbd className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-white/90">
                    {entry.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
