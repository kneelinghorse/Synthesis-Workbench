"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { createFoundryMcpClient } from "@/lib/mcp/foundry-client";
import { createStage1McpClient } from "@/lib/mcp/stage1-client";
import { formatMcpServiceError } from "@/lib/mcp/user-facing-errors";
import { cn } from "@/lib/utils";
import { writeCommandToComposer } from "@/lib/workbench/keyboard-shortcuts";

const ONBOARDING_DISMISS_KEY = "synthesis-workbench.onboarding.dismissed.v1";

type ServiceHealthState = {
  status: "checking" | "healthy" | "issue";
  message: string;
};

type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  command?: string;
  commandNote?: string;
};

type OnboardingProjectsResponse = {
  projects?: unknown[];
  count?: number;
};

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "services",
    title: "Connect services",
    description:
      "Confirm Stage1 and Foundry MCP services are reachable before running the workflow.",
  },
  {
    id: "bundle",
    title: "Load a Stage1 bundle",
    description:
      "Open the bundle tool and load an inspection run to seed components and token suggestions.",
    command: "/bundle",
    commandNote: "Use keyboard shortcut Ctrl/Cmd + Alt + B for fast command insertion.",
  },
  {
    id: "tokens",
    title: "Adjust tokens",
    description:
      "Apply token tweaks or import canonical tokens from Foundry to tune the design language.",
    command: "/tokens",
    commandNote: "Use Ctrl/Cmd + Alt + T to insert the command.",
  },
  {
    id: "render",
    title: "Render a component",
    description:
      "Render a component composition in preview. Try a simple example: ask the chat to \"Create a Card with a title and a Button\" to see the design system in action.",
    command: "/render",
    commandNote:
      "Use Ctrl/Cmd + Alt + R to insert the render command, or type a natural language request like \"Create a Card with a heading and two Buttons\" in the chat.",
  },
  {
    id: "export",
    title: "Export the result",
    description:
      "Finalize by exporting the active design artifact for handoff or downstream implementation.",
    command: "/export html",
    commandNote: "Use Ctrl/Cmd + Alt + E to insert the command.",
  },
];

const INITIAL_SERVICE_STATE: ServiceHealthState = {
  status: "checking",
  message: "Checking service connectivity...",
};

const SERVICE_BADGE_STYLE: Record<ServiceHealthState["status"], string> = {
  checking: "border-white/20 bg-white/5 text-white/70",
  healthy: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100",
  issue: "border-amber-500/40 bg-amber-500/15 text-amber-100",
};

const persistOnboardingDismissed = () => {
  try {
    window.localStorage.setItem(ONBOARDING_DISMISS_KEY, "1");
  } catch {
    // no-op in locked-down environments
  }
};

const readOnboardingDismissed = () => {
  try {
    return window.localStorage.getItem(ONBOARDING_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

const resolveProjectCount = (payload: OnboardingProjectsResponse) => {
  if (typeof payload.count === "number" && Number.isFinite(payload.count)) {
    return payload.count;
  }
  if (Array.isArray(payload.projects)) {
    return payload.projects.length;
  }
  return 0;
};

export const FirstRunOnboarding = ({ className }: { className?: string }) => {
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [stage1Health, setStage1Health] =
    useState<ServiceHealthState>(INITIAL_SERVICE_STATE);
  const [foundryHealth, setFoundryHealth] =
    useState<ServiceHealthState>(INITIAL_SERVICE_STATE);

  const currentStep = ONBOARDING_STEPS[stepIndex] ?? ONBOARDING_STEPS[0];
  const isFinalStep = stepIndex === ONBOARDING_STEPS.length - 1;

  const serviceChecks = useMemo(
    () => [
      { key: "Stage1", state: stage1Health },
      { key: "Foundry", state: foundryHealth },
    ],
    [foundryHealth, stage1Health]
  );

  const runHealthCheck = useCallback(async () => {
    setCheckingHealth(true);
    setStage1Health(INITIAL_SERVICE_STATE);
    setFoundryHealth(INITIAL_SERVICE_STATE);

    const stage1Promise = (async (): Promise<ServiceHealthState> => {
      try {
        const client = createStage1McpClient({
          timeoutMs: 2500,
          retry: { maxAttempts: 1 },
        });
        await client.listRuns();
        return {
          status: "healthy",
          message: "Stage1 MCP reachable.",
        };
      } catch (error) {
        return {
          status: "issue",
          message: formatMcpServiceError("stage1", error, {
            operation: "checking startup connectivity",
          }),
        };
      }
    })();

    const foundryPromise = (async (): Promise<ServiceHealthState> => {
      try {
        const client = createFoundryMcpClient({
          timeoutMs: 2500,
          retry: { maxAttempts: 1 },
        });
        await client.fetchStructuredData("manifest", { includePayload: false });
        return {
          status: "healthy",
          message: "Foundry MCP reachable.",
        };
      } catch (error) {
        return {
          status: "issue",
          message: formatMcpServiceError("foundry", error, {
            operation: "checking startup connectivity",
          }),
        };
      }
    })();

    const [stage1Result, foundryResult] = await Promise.all([
      stage1Promise,
      foundryPromise,
    ]);

    setStage1Health(stage1Result);
    setFoundryHealth(foundryResult);
    setCheckingHealth(false);
  }, []);

  useEffect(() => {
    void runHealthCheck();
  }, [runHealthCheck]);

  useEffect(() => {
    let cancelled = false;

    const detectFirstRun = async () => {
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        const payload = (await response.json()) as OnboardingProjectsResponse;
        const count = response.ok ? resolveProjectCount(payload) : 1;
        const firstRun = count === 0;
        const dismissed = readOnboardingDismissed();
        if (cancelled) {
          return;
        }

        setIsFirstRun(firstRun);
        if (firstRun && !dismissed) {
          setGuideOpen(true);
        }
      } catch {
        if (!cancelled) {
          setIsFirstRun(false);
        }
      }
    };

    void detectFirstRun();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleInsertCommand = useCallback((command: string) => {
    const wrote = writeCommandToComposer(command);
    setCommandFeedback(
      wrote
        ? `Inserted ${command} into composer.`
        : "Composer input unavailable. Open the chat panel and retry."
    );
  }, []);

  const closeAndDismiss = useCallback(() => {
    persistOnboardingDismissed();
    setGuideOpen(false);
    setStepIndex(0);
  }, []);

  // Health gate: Foundry must be reachable on the services step to proceed.
  const isServicesStep = currentStep.id === "services";
  const foundryReachable = foundryHealth.status === "healthy";
  const servicesGatePassed = !isServicesStep || foundryReachable;
  const primaryActionLabel = isFinalStep ? "Finish walkthrough" : "Next step";

  return (
    <>
      <section
        className={cn(
          "rounded-3xl border border-white/10 bg-white/5 p-4 text-white/80 backdrop-blur",
          className
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">
              First-Run Onboarding
            </p>
            <h2 className="mt-1 text-sm font-semibold text-white">
              {isFirstRun
                ? "New workspace detected"
                : "Workflow walkthrough ready"}
            </h2>
            <p className="mt-1 text-xs text-white/60">
              Guided setup for services, bundle ingest, token tuning, rendering, and export.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="bg-white text-black hover:bg-white/90"
            onClick={() => setGuideOpen(true)}
          >
            {isFirstRun ? "Start walkthrough" : "Open walkthrough"}
          </Button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {serviceChecks.map((entry) => (
            <div
              key={entry.key}
              className={cn(
                "rounded-xl border px-3 py-2 text-xs",
                SERVICE_BADGE_STYLE[entry.state.status]
              )}
            >
              <div className="font-medium">{entry.key}: {entry.state.status === "healthy" ? "Healthy" : entry.state.status === "checking" ? "Checking" : "Issue"}</div>
              <div className="mt-1 text-[11px] opacity-85">{entry.state.message}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={() => {
              void runHealthCheck();
            }}
            disabled={checkingHealth}
          >
            {checkingHealth ? "Checking services..." : "Re-check services"}
          </Button>
          <span className="text-[11px] text-white/50">
            Startup health checks run automatically on load.
          </span>
        </div>
      </section>

      {guideOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="First-run onboarding"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#10141d] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                  Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  {currentStep.title}
                </h3>
                <p className="mt-2 text-sm text-white/70">{currentStep.description}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                onClick={closeAndDismiss}
              >
                Skip for now
              </Button>
            </div>

            {currentStep.id === "services" ? (
              <div className="mt-4 space-y-2">
                {serviceChecks.map((entry) => (
                  <div
                    key={`guide-${entry.key}`}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-xs",
                      SERVICE_BADGE_STYLE[entry.state.status]
                    )}
                  >
                    <div className="font-medium">
                      {entry.key}:{" "}
                      {entry.state.status === "healthy"
                        ? "Healthy"
                        : entry.state.status === "checking"
                          ? "Checking"
                          : "Issue"}
                    </div>
                    <div className="mt-1 opacity-85">{entry.state.message}</div>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                    onClick={() => { void runHealthCheck(); }}
                    disabled={checkingHealth}
                  >
                    {checkingHealth ? "Checking..." : "Re-check services"}
                  </Button>
                  {!foundryReachable && !checkingHealth && (
                    <span className="text-[11px] text-amber-300/80">
                      Foundry must be reachable to proceed.
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            {currentStep.command ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-white/50">
                  Suggested command
                </div>
                <code className="mt-1 block text-sm text-white/90">
                  {currentStep.command}
                </code>
                {currentStep.commandNote ? (
                  <p className="mt-2 text-xs text-white/60">
                    {currentStep.commandNote}
                  </p>
                ) : null}
                <div className="mt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                    onClick={() => handleInsertCommand(currentStep.command!)}
                  >
                    Insert command
                  </Button>
                </div>
                {commandFeedback ? (
                  <p className="mt-2 text-xs text-white/65">{commandFeedback}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {ONBOARDING_STEPS.map((step, index) => (
                  <span
                    key={step.id}
                    className={cn(
                      "h-1.5 w-6 rounded-full",
                      index <= stepIndex ? "bg-emerald-300/90" : "bg-white/20"
                    )}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => {
                    setStepIndex((current) => Math.max(0, current - 1));
                    setCommandFeedback(null);
                  }}
                  disabled={stepIndex === 0}
                >
                  Back
                </Button>
                {isServicesStep && !servicesGatePassed && !checkingHealth && (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                    onClick={() => {
                      setStepIndex((current) =>
                        Math.min(ONBOARDING_STEPS.length - 1, current + 1)
                      );
                      setCommandFeedback(null);
                    }}
                  >
                    Continue anyway
                  </Button>
                )}
                <Button
                  type="button"
                  className={cn(
                    "bg-white text-black hover:bg-white/90",
                    !servicesGatePassed && "opacity-50"
                  )}
                  disabled={!servicesGatePassed}
                  onClick={() => {
                    if (isFinalStep) {
                      closeAndDismiss();
                      return;
                    }
                    setStepIndex((current) =>
                      Math.min(ONBOARDING_STEPS.length - 1, current + 1)
                    );
                    setCommandFeedback(null);
                  }}
                >
                  {primaryActionLabel}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
