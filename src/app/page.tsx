import Link from "next/link";

import { Button } from "@/components/ui/button";

const focusAreas = [
  {
    title: "Stage1 Intake",
    description:
      "Ingest inspector bundles and surface research insights alongside live execution.",
  },
  {
    title: "Phase Orchestration",
    description:
      "Sequence discovery, planning, and build phases with explicit handoffs.",
  },
  {
    title: "Foundry Calls",
    description:
      "Trigger OODS tooling with structured inputs and tracked outcomes.",
  },
];

const lanes = [
  { label: "Chat Thread", detail: "LocalRuntime ready" },
  { label: "Inspector Feed", detail: "Awaiting Stage1 bundle" },
  { label: "Phase Ledger", detail: "3 upcoming milestones" },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0c0f]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_at_15%_10%,rgba(72,147,131,0.18),transparent_60%),radial-gradient(900px_at_85%_15%,rgba(199,148,81,0.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px] opacity-20" />
      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-14 sm:px-10">
        <header className="flex flex-col gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.35em] text-white/60">
                Synthesis Workbench
              </p>
              <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">
                Orchestrate Stage1 insights into OODS execution.
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link href="/chat">Open Workbench</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/5 text-white hover:bg-white/10"
              >
                View Runbook
              </Button>
            </div>
          </div>
          <p className="max-w-2xl text-base leading-relaxed text-white/70">
            Bring inspector bundles, planning notes, and runtime adapters into a
            single decision surface built for design-driven agent workflows.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-white/60">
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">
              Stage1 Bundle
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">
              Phase Plan
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">
              Foundry MCP
            </span>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
              <h2 className="text-lg font-semibold text-white">Phase Console</h2>
              <p className="mt-2 text-sm text-white/65">
                Map inspection data to phased execution tracks without losing
                fidelity.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {focusAreas.map((area) => (
                  <div
                    key={area.title}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <h3 className="text-sm font-semibold text-white">
                      {area.title}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-white/60">
                      {area.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Workbench Shell
                  </h2>
                  <p className="mt-2 text-sm text-white/65">
                    A responsive layout skeleton ready for assistant threads
                    and inspectors.
                  </p>
                </div>
                <div className="text-xs uppercase tracking-[0.3em] text-white/50">
                  Live
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {lanes.map((lane) => (
                  <div
                    key={lane.label}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-white/50">
                      {lane.label}
                    </div>
                    <div className="mt-3 text-sm font-medium text-white">
                      {lane.detail}
                    </div>
                  </div>
                ))}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/50">
                    Adapters
                  </div>
                  <div className="mt-3 text-sm font-medium text-white">
                    Ollama · Anthropic
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
              <h2 className="text-lg font-semibold text-white">
                Execution Pulse
              </h2>
              <div className="mt-6 space-y-4">
                {[
                  "Bundle mapped to phase backlog",
                  "Runtime adapters queued for config",
                  "UI shell ready for chat threads",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70"
                  >
                    <span className="mt-1 size-2 rounded-full bg-white/70" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
              <h2 className="text-lg font-semibold text-white">Next Steps</h2>
              <p className="mt-2 text-sm text-white/65">
                Wire LocalRuntime, bring in Stage1 bundles, and activate Foundry
                phases.
              </p>
              <Button className="mt-6 w-full" variant="secondary">
                Configure Runtime
              </Button>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
