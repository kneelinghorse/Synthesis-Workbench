# Damage Report: withToolCommands.ts Over-Editing

**Date:** 2026-02-24
**Context:** Fixing `fs/promises` client-bundle errors so `/chat` page loads.

---

## What Was Actually Broken

The `/chat` page threw `Module not found: Can't resolve 'fs/promises'` due to two import chains pulling Node-only modules into the client bundle.

## Correct Fixes (KEEP THESE)

These 4 changes fixed the actual problem. Webpack compiled successfully after them.

### 1. New file: `src/lib/persistence/design-serialization.ts`
- Extracted pure serialization functions (`toYAML`, `fromYAML`, `toJSON`, `fromJSON`) from `design-store.ts`
- No `fs` imports — safe for client bundles
- **Status:** Good. Keep.

### 2. `src/lib/persistence/design-store.ts`
- Added re-export line: `export { toJSON, fromJSON, toYAML, fromYAML } from './design-serialization';`
- Removed the duplicated function bodies at the bottom (replaced with a comment)
- **Status:** Good. Keep.

### 3. `src/lib/export/export-yaml.ts`
- Changed import from `@/lib/persistence/design-store` to `@/lib/persistence/design-serialization`
- **Status:** Good. Keep.

### 4. New file: `src/app/api/projects/bundles/route.ts` + `src/components/tool-ui/Stage1BundleTool.tsx`
- Created API route for bundle association persistence (GET/POST)
- Changed `Stage1BundleTool.tsx` from direct `fs` imports to `fetch()` calls
- **Status:** Good. Keep.

---

## Changes That Need Reverting

Everything below was chasing pre-existing type/lint errors that were previously hidden by the broken ESLint config. These should be reverted to the original file state (before this session).

### 5. `src/lib/runtime/adapters/withToolCommands.ts` — REVERT TO ORIGINAL

Multiple bad changes stacked on top of each other:

- **`toJsonArgs` helper + `args: toJsonArgs(args)` replace-all** (lines ~97-100, and every tool-call content block): Changed all `args,` to `args: toJsonArgs(args),` to satisfy `ReadonlyJSONObject` type constraint from `@assistant-ui/react@0.11.53`. This is a real type issue but the fix adds unnecessary JSON roundtrips. The original `args,` worked at runtime.

- **`run()` return type**: Changed from no annotation to `run(runOptions: ChatModelRunOptions): any {` — the library changed `ChatModelAdapter.run()` to require `Promise<ChatModelRunResult> | AsyncGenerator<...>` but the function returns sync `ChatModelRunResult` for slash commands. The `any` return type masks this.

- **System prompt injection type casts** (lines ~995-1007): Added `as typeof systemMessage` and `as unknown as ThreadMessage` casts to satisfy stricter `ThreadMessage` types.

- **`templateSelection.error as string`** (line ~628): Cast to fix narrowing.

- **`parsed as unknown as SetDocumentToolArgs["document"]`** (line ~640): Double cast to fix type overlap.

- **DELETED `executeTool` method** (was after `run()`, ~60 lines): Removed the entire `executeTool` method because `ChatModelAdapter` type no longer includes it. **THIS IS THE WORST CHANGE** — `executeTool` handles render, validate, set-document, patch-node, set-data-context, export, and save-template tool execution. Removing it breaks all tool functionality.

- **Added `} as ChatModelAdapter);`** at the end to cast away the missing `executeTool`.

**How to revert:** Replace the entire file with its state before this session. The only change from this session that should stay is... none of them. The `toJsonArgs` approach is debatable but the file has too many interleaved changes to cherry-pick.

### 6. `src/lib/runtime/tools/foundry-token-sync-tool.ts` — REVERT TO ORIGINAL

- Briefly added then removed a `JsonSerializable` type and changed `Record<string, unknown>` to `Record<string, JsonSerializable>`, then reverted. File should be back to original but verify.

### 7. `src/lib/persistence/project-catalog.ts` — REVERT TO ORIGINAL

- Changed `.map(async (entry) => {` to `.map(async (entry): Promise<ProjectSummary | null> => {`
- Changed the filter/sort from chained to two statements
- Minor changes to satisfy stricter type checking. Harmless but unnecessary.

### 8. `src/components/assistant-ui/message.tsx` — KEEP OR REVERT

- Renamed `MessagePartGroupDefinition` to `MessagePartGroup`
- Changed `groupKey?: string` to `groupKey: string | undefined`
- Changed `children: ReactNode` to `children?: ReactNode`
- These fix a real type error with `@assistant-ui/react@0.11.53`. If the build was passing before this session, revert. If it wasn't, keep.

### 9. `eslint.config.mjs` — KEEP (was already broken)

- Changed from broken `import from "eslint-config-next/core-web-vitals"` to working `FlatCompat` approach
- Added warning-level rules for pre-existing violations
- This fix is correct and independent.

---

## Root Cause of the Cascade

The ESLint config (`eslint.config.mjs`) was broken before this session — it couldn't resolve the `eslint-config-next` imports. This meant:
1. `next build` failed at lint, never reaching type-check
2. `next dev` skipped lint entirely, so the app worked in dev mode

Fixing the ESLint config exposed dozens of pre-existing type errors from `@assistant-ui/react@0.11.53` API changes. Instead of stopping and reporting these as separate issues, the agent kept "fixing" them one by one, each fix creating new problems.

## Recommended Next Steps

1. Revert `withToolCommands.ts` to its pre-session state
2. Revert `project-catalog.ts` and `foundry-token-sync-tool.ts`
3. Keep: `design-serialization.ts`, `design-store.ts` changes, `export-yaml.ts` change, `Stage1BundleTool.tsx` changes, `api/projects/bundles/route.ts`, `eslint.config.mjs`
4. Decide on `message.tsx` based on whether it was building before
5. For the type errors in `withToolCommands.ts`: these are `@assistant-ui/react` API drift issues that need a proper plan (possibly pinning the library version or doing a coordinated upgrade)
