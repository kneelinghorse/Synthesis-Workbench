# Phase Workflow Refinements (Sprint 14)

## Context
Usage across Sprints 7-13 showed two recurring friction points:

1. Experienced users iterate non-linearly (bundle reloads, token edits, and render checks in quick loops), but strict phase gates blocked frequent commands.
2. Requiring users to manage phase state for every adjustment slowed day-to-day operation after initial onboarding.

These observations are reflected in the phase E2E flow (`src/lib/runtime/e2e-phase-workflow.test.ts`) and repeated gating checks in command adapter tests (`src/lib/runtime/adapters/withToolCommands.test.ts`).

## Refinements Implemented

1. Added `workflowMode` to phase state with two modes:
   - `strict` (default): original guardrails.
   - `flexible`: relaxed gating for rapid iteration.
2. Updated phase tool map logic to accept workflow mode:
   - strict mode keeps explicit tool-phase constraints.
   - flexible mode allows known tools across phases.
3. Updated command adapter gating (`withToolCommands`) to enforce gates based on the active workflow mode.
4. Added UI mode toggle in Chat Workbench shell (`Strict` / `Flexible`) so users can switch behavior without leaving the active flow.

## Why This Better Matches Real Usage

1. New users retain clear workflow structure with strict mode.
2. Returning users can reduce friction with flexible mode when they already understand the toolchain.
3. Phase transitions and workflow sequencing still exist, but gating no longer blocks common iterative loops when flexibility is preferred.
