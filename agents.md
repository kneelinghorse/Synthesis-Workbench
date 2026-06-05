# Synthesis Workbench: Project Agent Instructions


---
## Hard Operating Rules

**Foundational — preserve this block when customizing the rest of this file.**

**These rules are not optional.**

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work.

### Rule 1 — Think Before Coding

State assumptions explicitly. Ask rather than guess.
Push back when a simpler approach exists. Stop when confused.

### Rule 2 — Simplicity First

Minimum code that solves the problem. Nothing speculative.
No abstractions for single-use code.

### Rule 3 — Surgical Changes

Touch only what you must. Don't improve adjacent code.
Match existing style. Don't refactor what isn't broken.

### Rule 4 — Goal-Driven Execution

Define success criteria. Loop until verified.
Strong success criteria let Claude loop independently.

### Rule 5 — Capture decisions and learnings

Non-trivial choices belong in CMOS. Decisions to `cmos_decisions`, cross-cutting patterns to `cmos_learnings`.
If future-you needs to know why, capture it now.

### Rule 6 — Commit at coherent boundaries

Commit at mission close, sprint close, or day boundary. Per-mission commits only when a sprint surfaces a real bisection need.

### Rule 7 — Surface conflicts, don't average them

If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.

### Rule 8 — Read before you write

Before adding code, read exports, immediate callers, shared utilities.
If unsure why existing code is structured a certain way, ask.

### Rule 9 — Tests verify intent, not just behavior

Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

### Rule 10 — Checkpoint after every significant step

Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.

### Rule 11 — Match the codebase's conventions, even if you disagree

Conformance > taste inside the codebase.
If you think a convention is harmful, surface it. Don't fork silently.

### Rule 12 — Fail loud

"Completed" is wrong if anything was skipped silently. "Tests pass" is wrong if any were skipped.
Flag uncertainty before stating a fact, statistic, date, or technical detail — never fill gaps with plausible-sounding information.

### Rule 13 — No filler openings

Start with the answer. No "Great question!", "Of course!", "Certainly!", or warmup acknowledgments.

### Rule 14 — Match response length to task

Simple questions get short answers. Complex tasks get full responses.
Don't pad with restatements or closing sentences that repeat what was just said.

---

## Project Identity
- **Name**: Synthesis Workbench
- **Mission**: Central workbench that orchestrates Stage1 research, planning, and phased execution into OODS outputs.
- **Role**: Integrator between Stage1 Inspector outputs and OODS Foundry MCP tools.

## Architecture & Boundaries
- **Web-first**: Next.js app, no Electron shell.
- **Standalone tools**: Stage1 Inspector and OODS Foundry MCP are independent services with stable contracts.
- **Workbench is the hub**: It ingests Stage1 bundles, manages phases, and calls Foundry tools.
- **Avoid tight coupling**: Prefer file- or MCP-based interfaces over shared internal code.

## Technology Stack (Current)
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict)
- **UI**: Tailwind CSS v4 + Shadcn/UI
- **Chat**: `@assistant-ui/react` with `LocalRuntime`
- **State**: `zustand`
- **Motion**: `framer-motion` when needed

## Repository Rules
- Application code lives at the repo root (e.g., `src/`).
- `cmos/` is project management only; do not place app code there.
- If architecture changes, update `cmos/foundational-docs/technical-architecture.md`.

## Runtime Configuration
Document env vars in `.env.local` when introduced. Typical keys include:
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL`
- `ANTHROPIC_API_KEY`
- `OODS_FOUNDRY_MCP_URL` (or equivalent MCP config)

## Workflow Expectations
- Use CMOS mission workflow for implementation work.
- Keep mission success criteria and deliverables current.
- Keep contracts and integration assumptions explicit and documented.
