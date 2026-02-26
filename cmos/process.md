# Synthesis Workbench Process Notes

## Decision Log Habit
- Capture at least **one CMOS decision per sprint** during implementation work.
- Use `cmos_session_capture(category="decision", ...)` when a technical choice is made.
- If no major architecture decision occurred, capture a process/tooling decision instead.

## CI-Critical Adapter Tests
- Streaming adapter contract tests are CI-critical:
  - `src/lib/runtime/adapters/anthropic.test.ts`
  - `src/lib/runtime/adapters/ollama.test.ts`
- Run `npm run test:adapters` before finalizing runtime or adapter changes.
- `vitest.config.ts` explicitly includes these files to prevent accidental exclusion.
