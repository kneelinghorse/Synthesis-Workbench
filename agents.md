# Synthesis Workbench: Project Agent Instructions

This file governs application development in this repo. For CMOS operations, see `cmos/agents.md`.

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
