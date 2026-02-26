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
  type ToolOutputCalloutTone,
} from "@/components/tool-ui/ToolOutputCard";
import { Button } from "@/components/ui/button";
import { usePhaseStore, type ReviewGateDecision } from "@/lib/stores/phase-state";
import { cn } from "@/lib/utils";
import {
  REVIEW_GATE_TOOL_NAME,
  type ReviewGateToolArgs,
  type ReviewGateToolResult,
} from "@/lib/runtime/tools/review-gate-tool";
import { DEFAULT_PHASES, type PhaseDefinition, type PhaseId } from "@/types/phase";

type GateBadge = {
  label: string;
  className: string;
};

const decisionLabels: Record<ReviewGateDecision, string> = {
  approved: "Approved",
  blocked: "Blocked",
  pending: "Pending review",
};

const decisionToneMap: Record<ReviewGateDecision, ToolOutputCalloutTone> = {
  approved: "success",
  blocked: "danger",
  pending: "warning",
};

const decisionBadgeMap: Record<ReviewGateDecision, GateBadge> = {
  approved: {
    label: "Approved",
    className: "border-emerald-500/40 text-emerald-100",
  },
  blocked: {
    label: "Blocked",
    className: "border-rose-500/40 text-rose-100",
  },
  pending: {
    label: "Pending",
    className: "border-amber-500/40 text-amber-100",
  },
};

const neutralBadge: GateBadge = {
  label: "No gate",
  className: "border-white/15 text-white/50",
};

const decisionButtonStyles: Record<Exclude<ReviewGateDecision, "pending">, string> =
  {
    approved: "border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/10",
    blocked: "border-rose-400/40 text-rose-100 hover:bg-rose-500/10",
  };

const ReviewGateToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<ReviewGateToolArgs, ReviewGateToolResult>) => {
  const [note, setNote] = useState("");
  const resolved = Boolean(result);

  const phases = args?.phases?.length ? args.phases : DEFAULT_PHASES;
  const reviewPhases = phases.filter((phase) => phase.requiresReview);
  const selectablePhases = reviewPhases.length ? reviewPhases : phases;
  const initialPhase =
    args?.targetPhase ?? selectablePhases[0]?.id ?? null;

  const [selectedPhase, setSelectedPhase] = useState<PhaseId | null>(
    initialPhase
  );

  const { currentPhase, gateDecisions, setGateDecision } = usePhaseStore(
    useShallow((state) => ({
      currentPhase: state.currentPhase,
      gateDecisions: state.gateDecisions,
      setGateDecision: state.setGateDecision,
    }))
  );

  useEffect(() => {
    if (!selectedPhase && initialPhase) {
      setSelectedPhase(initialPhase);
    }
  }, [initialPhase, selectedPhase]);

  useEffect(() => {
    if (result?.phase) {
      setSelectedPhase(result.phase);
    }
  }, [result?.phase]);

  useEffect(() => {
    if (!result?.phase) return;
    setGateDecision(result.phase, result.decision);
  }, [result?.decision, result?.phase, setGateDecision]);

  const selectedDefinition = selectedPhase
    ? phases.find((phase) => phase.id === selectedPhase)
    : null;

  const selectedDecision = selectedPhase ? gateDecisions[selectedPhase] : null;

  useEffect(() => {
    if (resolved) return;
    if (!selectedPhase || !selectedDefinition?.requiresReview) return;
    if (!selectedDecision) {
      setGateDecision(selectedPhase, "pending");
    }
  }, [
    resolved,
    selectedDecision,
    selectedDefinition?.requiresReview,
    selectedPhase,
    setGateDecision,
  ]);

  const requestMeta = useMemo(
    () => ({
      requestId: args?.requestId ?? "unknown",
      title: args?.title ?? "Review gate",
      prompt:
        args?.prompt ??
        "Approve or block a phase transition that requires review.",
    }),
    [args?.prompt, args?.requestId, args?.title]
  );

  const displayDecision: ReviewGateDecision =
    result?.decision ?? selectedDecision ?? "pending";

  const displayDecisionLabel = decisionLabels[displayDecision];
  const decisionTone = decisionToneMap[displayDecision];

  const currentPhaseLabel =
    phases.find((phase) => phase.id === currentPhase)?.label ?? currentPhase;

  const resolveGateBadge = (phase: PhaseDefinition): GateBadge => {
    const decision = gateDecisions[phase.id];
    if (decision) return decisionBadgeMap[decision];
    if (phase.requiresReview) return decisionBadgeMap.pending;
    return neutralBadge;
  };

  const submitDecision = (decision: Exclude<ReviewGateDecision, "pending">) => {
    if (!selectedPhase || resolved) return;
    setGateDecision(selectedPhase, decision);
    addResult({
      phase: selectedPhase,
      decision,
      note: note.trim() || undefined,
      resolvedAt: new Date().toISOString(),
    });
  };

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Review Gate</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{requestMeta.title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{requestMeta.prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={status.type} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>Request ID: {requestMeta.requestId}</div>
            <div>Current phase: {currentPhaseLabel}</div>
            <div>
              Gate target: {selectedDefinition?.label ?? "None selected"}
            </div>
          </div>
        </ToolOutputCardMeta>

        {isError ? (
          <ToolOutputCardCallout tone="danger">
            Tool error reported.
          </ToolOutputCardCallout>
        ) : null}

        {selectedPhase ? (
          <ToolOutputCardCallout tone={decisionTone} className="space-y-2">
            {resolved ? (
              <>
                <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                  Decision captured
                </div>
                <div className="text-sm font-medium">
                  {displayDecisionLabel}
                </div>
                {result?.note ? (
                  <div className="text-xs text-white/70">{result.note}</div>
                ) : null}
                <div className="text-xs text-white/50">
                  Resolved at {result?.resolvedAt}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                  Decision state
                </div>
                <div className="text-sm font-medium">
                  {displayDecisionLabel}
                </div>
                <div className="text-xs text-white/60">
                  Choose a phase and approve or block the transition.
                </div>
              </>
            )}
          </ToolOutputCardCallout>
        ) : (
          <ToolOutputCardCallout tone="warning">
            No review phases configured.
          </ToolOutputCardCallout>
        )}

        {resolved ? null : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {selectablePhases.map((phase) => {
                const badge = resolveGateBadge(phase);
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
              placeholder="Add approval notes..."
              rows={3}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/10"
            />
          </>
        )}
      </ToolOutputCardBody>

      {resolved || !selectedPhase ? null : (
        <ToolOutputCardFooter>
          <span className="text-xs text-white/50">
            {selectedDefinition
              ? `Selected: ${selectedDefinition.label}`
              : "Select a phase to continue."}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(decisionButtonStyles.approved)}
              onClick={() => submitDecision("approved")}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(decisionButtonStyles.blocked)}
              onClick={() => submitDecision("blocked")}
            >
              Block
            </Button>
          </div>
        </ToolOutputCardFooter>
      )}
    </ToolOutputCard>
  );
};

export const ReviewGateToolUI = makeAssistantToolUI<
  ReviewGateToolArgs,
  ReviewGateToolResult
>({
  toolName: REVIEW_GATE_TOOL_NAME,
  render: ReviewGateToolCard,
});
