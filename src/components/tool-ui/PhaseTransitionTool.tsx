"use client";

import { makeAssistantToolUI, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  ToolOutputCard,
  ToolOutputCardBody,
  ToolOutputCardCallout,
  ToolOutputCardDescription,
  ToolOutputCardEyebrow,
  ToolOutputCardFooter,
  ToolOutputCardHeader,
  ToolOutputCardHeading,
  ToolOutputCardMeta,
  ToolOutputCardStatus,
  ToolOutputCardTitle,
} from "@/components/tool-ui/ToolOutputCard";
import { Button } from "@/components/ui/button";
import {
  usePhaseStore,
  type ReviewGateDecision,
} from "@/lib/stores/phase-state";
import { cn } from "@/lib/utils";
import {
  PHASE_TRANSITION_TOOL_NAME,
  type PhaseTransitionToolArgs,
  type PhaseTransitionToolResult,
} from "@/lib/runtime/tools/phase-transition-tool";
import {
  DEFAULT_PHASES,
  type PhaseDefinition,
  type PhaseId,
} from "@/types/phase";

type PhaseBadge = {
  label: string;
  className: string;
};

const gateBadgeMap: Record<ReviewGateDecision, PhaseBadge> = {
  approved: {
    label: "Approved",
    className: "border-emerald-500/40 text-emerald-100",
  },
  blocked: {
    label: "Blocked",
    className: "border-rose-500/40 text-rose-100",
  },
  pending: {
    label: "Pending review",
    className: "border-amber-500/40 text-amber-100",
  },
};

const PhaseTransitionToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<PhaseTransitionToolArgs, PhaseTransitionToolResult>) => {
  const [selectedPhase, setSelectedPhase] = useState<PhaseId | null>(null);
  const [note, setNote] = useState("");
  const resolved = Boolean(result);

  const {
    currentPhase,
    phaseHistory,
    transitionBlockers,
    gateDecisions,
    seedPhase,
    canTransitionTo,
    transitionTo,
  } = usePhaseStore(
    useShallow((state) => ({
      currentPhase: state.currentPhase,
      phaseHistory: state.phaseHistory,
      transitionBlockers: state.transitionBlockers,
      gateDecisions: state.gateDecisions,
      seedPhase: state.seedPhase,
      canTransitionTo: state.canTransitionTo,
      transitionTo: state.transitionTo,
    }))
  );

  const phases = useMemo(
    () => (args?.phases?.length ? args.phases : DEFAULT_PHASES),
    [args?.phases]
  );

  useEffect(() => {
    if (args?.currentPhase) {
      seedPhase(args.currentPhase);
    }
  }, [args?.currentPhase, seedPhase]);

  const requestId = args?.requestId ?? "unknown";
  const title = args?.title ?? "Phase Transition";
  const prompt =
    args?.prompt ?? "Select the next workflow phase and confirm the transition.";

  const currentDefinition =
    phases.find((phase) => phase.id === currentPhase) ??
    DEFAULT_PHASES.find((phase) => phase.id === currentPhase);

  const selectedDefinition = selectedPhase
    ? phases.find((phase) => phase.id === selectedPhase)
    : null;

  const selectionAssessment = selectedPhase
    ? canTransitionTo(selectedPhase, phases)
    : null;

  const phaseHistoryLabel = phaseHistory
    .map(
      (phaseId) =>
        phases.find((phase) => phase.id === phaseId)?.label ?? phaseId
    )
    .join(" -> ");

  const resolvePhaseBadge = (phase: PhaseDefinition): PhaseBadge => {
    if (phase.id === currentPhase) {
      return {
        label: "Current",
        className: "border-white/20 text-white/70",
      };
    }

    const gateDecision = gateDecisions[phase.id];
    if (gateDecision) {
      return gateBadgeMap[gateDecision];
    }

    if (phase.requiresReview) {
      return {
        label: "Needs review",
        className: "border-amber-500/40 text-amber-100",
      };
    }

    return {
      label: "Available",
      className: "border-cyan-500/40 text-cyan-100",
    };
  };

  const submitTransition = () => {
    if (!selectedPhase || resolved) return;
    const previousPhase = currentPhase;
    const assessment = transitionTo(selectedPhase, phases);
    if (!assessment.allowed) return;

    addResult({
      previousPhase,
      nextPhase: selectedPhase,
      approved: true,
      blockedByGate: false,
      note: note.trim() || undefined,
      resolvedAt: new Date().toISOString(),
    });
  };

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Phase Transition</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={status.type} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>Request ID: {requestId}</div>
            <div>
              Current phase: {currentDefinition?.label ?? currentPhase}
            </div>
            <div>History: {phaseHistoryLabel}</div>
          </div>
        </ToolOutputCardMeta>

        {isError ? (
          <ToolOutputCardCallout tone="danger">
            Tool error reported.
          </ToolOutputCardCallout>
        ) : null}

        {resolved ? (
          <ToolOutputCardCallout tone="success" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-100/70">
              Transition complete
            </div>
            <div className="text-sm font-medium text-emerald-50">
              {result?.previousPhase} {"->"} {result?.nextPhase}
            </div>
            {result?.note ? (
              <div className="text-xs text-emerald-100/60">{result.note}</div>
            ) : null}
            <div className="text-xs text-emerald-100/50">
              Resolved at {result?.resolvedAt}
            </div>
          </ToolOutputCardCallout>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {phases.map((phase) => {
                const badge = resolvePhaseBadge(phase);
                const isSelected = selectedPhase === phase.id;
                return (
                  <button
                    key={phase.id}
                    type="button"
                    onClick={() => setSelectedPhase(phase.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition",
                      "border-white/10 bg-black/20 hover:border-white/30",
                      isSelected &&
                        "border-white/50 bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.15)]"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {phase.label}
                        </div>
                        <div className="text-xs text-white/60">
                          {phase.description}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em]",
                          badge.className
                        )}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional notes for this transition..."
              rows={3}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/10"
            />

            {selectionAssessment && !selectionAssessment.allowed ? (
              <ToolOutputCardCallout tone="warning" className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-amber-100/80">
                  Guardrails
                </div>
                <div className="space-y-1 text-xs text-white/70">
                  {selectionAssessment.blockers.map((blocker) => (
                    <div key={blocker}>{blocker}</div>
                  ))}
                </div>
              </ToolOutputCardCallout>
            ) : null}

            {transitionBlockers.length > 0 ? (
              <ToolOutputCardCallout tone="warning" className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-amber-100/80">
                  Last attempt blocked
                </div>
                <div className="space-y-1 text-xs text-white/70">
                  {transitionBlockers.map((blocker) => (
                    <div key={blocker}>{blocker}</div>
                  ))}
                </div>
              </ToolOutputCardCallout>
            ) : null}
          </>
        )}
      </ToolOutputCardBody>

      {resolved || isError ? null : (
        <ToolOutputCardFooter>
          <span className="text-xs text-white/50">
            {selectedDefinition
              ? `Selected: ${selectedDefinition.label}`
              : "Select a phase to continue."}
          </span>
          <Button
            type="button"
            size="sm"
            className="bg-white text-black hover:bg-white/90"
            onClick={submitTransition}
            disabled={!selectedPhase || !selectionAssessment?.allowed}
          >
            Confirm transition
          </Button>
        </ToolOutputCardFooter>
      )}
    </ToolOutputCard>
  );
};

export const PhaseTransitionToolUI = makeAssistantToolUI<
  PhaseTransitionToolArgs,
  PhaseTransitionToolResult
>({
  toolName: PHASE_TRANSITION_TOOL_NAME,
  render: PhaseTransitionToolCard,
});
