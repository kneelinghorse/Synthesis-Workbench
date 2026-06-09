# Sprint-20 Handoff — Comment-layer v1 shipped + E2E feedback

**Date:** 2026-06-09
**Branch:** `reframe/review-surface`
**Author:** build session (Claude) + Derek's E2E inspection

---

## 1. What shipped this session

The sprint-20 hero — **Workbench as the human review surface for headless OODS Forge** — is now functional end-to-end. Three missions landed, each adversarially reviewed:

| Commit | Mission | Summary |
|---|---|---|
| `a9c8a61` | **s20-m06** + **s20-m03 Chunk 1** | Slot-anchor forwarding (adapter `meta.label`) + the comment layer: selection bridge, comment store, pin overlay |
| `4c34496` | **s20-m03 Chunk 2** | Suggest-and-confirm: gated `set_document`/`patch_node` diff cards (Accept applies, Reject discards) + live `{document, tokens, comments}` packaged into the agent prompt |
| `414e348` | **s20-m05** | `npm run typecheck` clean (0 errors, 17 test files, no weakening) |

**Quality gates at session end:** `npm run build` green · `npm run typecheck` 0 errors · `vitest` 708 passing.

**Forge contract (Q1/Q2) answered 2026-06-09** — recorded in s20-m07:
- `data-oods-node-id` is a **per-compose-run counter** → renumbers on any structural add/remove/reorder → **best-effort only**.
- `data-oods-label` (from `node.meta.label`) is the **durable, structure-independent anchor** — but **not unique** within a doc, so Option B must anchor on **label + a disambiguator** (nearest entity/parent label).
- Forge formalizes the fragment-anchor contract in **their sprint-106 m01** (declare label durable + node-id best-effort; extend the parity test to `repl.render format:fragments`). "Safe to design entity-slot anchoring around the label now."
- **Impact:** validates v1 (local `patch_node` never restructures → instance anchors stay stable); clears the design-time gate on **s20-m07** (Option B north-star, post-v1).

---

## 2. E2E validation outcome

Derek ran the workbench end-to-end (`npm run dev:services`, `/chat`). **It works:** the agent loads, composes a design (a basic landing page — header text, info card, action button), the comment layer accepts critiques, and the agent regenerates via the suggest-and-confirm diff card with a working Accept. **Four issues surfaced** — one functional bug, one functional loop, and two layout/UX problems. All four are captured as missions **s20-m09 … s20-m12** (sprint-21 candidates).

---

## 3. The four issues (detail)

### s20-m09 — BUG (HIGH, "the one true bug"): unmapped components render as a metadata dump + are unclickable
**Symptom (Derek):** the heading "Welcome to test page" rendered as three stacked lines — `text` / `content: Welcome to the test page` / `variant: heading` — i.e. the component metadata, not the heading. It was also **not clickable** (no comment possible).

**Root cause (confirmed, partial):** `src/lib/engine/fragment-enhancer.ts` — the `ENHANCERS` registry maps only `Card / InlineLabel / RelativeTimestamp / Stack / TagPills`. Any other normalized component type falls to `renderGenericEnhancement`, which renders the **componentType as a title** + **up to 4 props as `key: value` rows** — exactly the observed output. This only fires when Forge returns an **empty shell** for the component (`enhanceFragment` fills empty shells). So the deeper question: **why did the heading produce an empty shell?** Likely an unsupported component ref or wrong prop names emitted by the agent (the real OODS `Text` probably doesn't use `content`/`variant`). **Unclickable** because the generic-enhancer output carries no `data-oods-node-id`/`data-oods-label`, so the inject-script CAPTURE click handler finds no anchor.

**Fix direction:** (a) fix the source — why Forge returns empty shells for the agent's components (catalog/prompt/ref/prop mismatch in `ResearchContext` + the OODS component contract); (b) make the generic fallback render sanely or fail loudly, not dump metadata; (c) guarantee every rendered element carries a Forge anchor so it's clickable. **Files:** `fragment-enhancer.ts`, `foundry-fragment-adapter.ts`, `preview-renderer.ts`, `ResearchContext.tsx`.

### s20-m10 — BUG (HIGH): comment→change loop — Accept doesn't resolve the comment, agent re-proposes endlessly
**Symptom (Derek):** renamed a card to "feedback card" via a comment; the change appeared on the canvas with an Accept button and applied correctly — **but the agent kept re-proposing the same change every turn.** Resolving the comment manually stopped the loop, but then the agent "could not find the issue" (lost context).

**Root cause (confirmed, from Chunk 2 design):** `review-context.ts > formatReviewComments` injects **OPEN (unresolved) comments into the system prompt every turn**. `DocumentToolUI` Accept applies the document edit but **never resolves the originating comment**, and there is **no comment↔change linkage**. So the open comment persists in context → the agent re-proposes indefinitely. Manual resolve is a workaround that drops the comment from context entirely (hence "can't find the issue").

**Fix direction:** link a proposed change to the comment(s) it addresses; on Accept, mark those comments addressed/resolved so they leave the active prompt context; define the lifecycle (open → addressed → resolved/history) so resolving means "done", not "lost". **Files:** `comment-state.ts` (status + linkage), `DocumentToolUI.tsx` (resolve-on-accept), `review-context.ts`, `ResearchContext.tsx`. **This is the highest-value functional follow-up — it breaks the core review→change→done loop.**

### s20-m11 — UX (MEDIUM): resolved comments occlude the canvas; need minimize/dismiss/history
**Symptom (Derek):** a resolved comment stays visible with its text struck through and **covers the right side of the screen**; the constrained two-column layout handles this poorly. Wants to minimize/dismiss comments or move them behind a Resolved/Completed/History view.

**Root cause:** `CommentLayer.tsx` renders **all** comments (including resolved, strikethrough) in a fixed right-edge panel that overlays the canvas.

**Fix direction:** move resolved comments to a collapsible History group (hidden by default); make the side panel minimizable; don't occlude the canvas; clear open/resolved/dismissed states. Pairs with s20-m10's lifecycle. **File:** `CommentLayer.tsx`.

### s20-m12 — LAYOUT (MEDIUM): chat and canvas scroll are coupled — growing chat pushes the canvas off-screen
**Symptom (Derek):** the chat column and canvas column are "attached" — as the narrow chat column grows (a few sentences fill it fast), the **canvas grows down the page too**, moving the design further away. By the second turn Derek had to scroll up significantly to see the change.

**Root cause:** the two-column shell isn't using independent scroll containers; page height grows with chat content.

**Fix direction:** `ChatWorkbenchShell.tsx` — fixed-height flex row with **each column its own `overflow-y-auto`**, so the chat scrolls internally without growing the canvas; the preview stays pinned in the viewport. **File:** `ChatWorkbenchShell.tsx`.

---

## 4. Remaining backlog (status)

- **s20-m08** — dead-code sweep (orphaned template subsystem). Actionable but **delete-heavy**; first step is a consumer audit (it may still feed the kept foundry-catalog path). Not started — wants a deliberate audit + go-ahead.
- **s20-m07** — Option B (full Forge compose). Anchor gate cleared (see §1); post-v1 north-star, likely sprint-21. Depends on Forge sprint-106 m01 for the hardened contract test.
- **s20-m04** — graph canvas (React Flow). Still deferred — waits on a Forge node/edge graph artifact that doesn't exist yet (the Forge reply was about anchors, not the graph artifact).
- **s19-m05** — E2E with live Stage1. Blocked on an upstream Stage1 `inspect_app` regression.

---

## 5. Recommended next-session sequencing

1. **s20-m10** (comment loop) + **s20-m11** (comment overlay) together — they share the comment lifecycle; this restores the core review loop and the most jarring UX.
2. **s20-m12** (scroll decoupling) — small, high-friction-relief layout fix.
3. **s20-m09** (render bug) — needs investigation into the Forge empty-shell cause + the agent's component composition; pair with looking at real OODS component refs/props.
4. Then **s20-m08** (dead-code audit) and the deferred north-stars (**s20-m07**, **s20-m04**) as Forge artifacts/contracts land.
