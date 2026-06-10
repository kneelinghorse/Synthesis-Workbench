# Sprint 21 Build Handoff — "Option B: Agent Regenerates via Headless Forge"

**Date:** 2026-06-10 · **Author:** Sprint-20 review/closeout + Sprint-21 planning session
**Read this alongside `cmos_review()`** (session opener) — this doc adds the *why*, sequencing, and gotchas the digest doesn't carry.

## Where things stand
- **Sprint-20 is CLOSED.** The review-surface reframe shipped: comment-layer v1 (m03 hero) + hardening (m09–m12), −8,800 LOC builder cut (m02/m08), health pass (m01/m05).
- **Reframe is merged to `main` via PR #1** (`3d5f500`), now at `2e2f337`. `main == origin/main`, working tree clean. **`main` builds clean** (`next build` → 13/13 static pages incl `/chat`, `tsc --noEmit` clean).
- **Start a fresh feature branch off `main`** for build work (don't work on `main`).

## Sprint-21 missions
| # | Mission | Start? | Notes |
|---|---|---|---|
| **m01** | Enforced build-health guardrail (CI/pre-push) | ✅ now | **Recommended first move.** CI/pre-push running `typecheck` + `build`, blocking on failure. Closes the id2 gap. |
| **m02** | Adopt the Forge action-mode contract | ✅ **now (urgent)** | **Forge confirmed (s107) — adopt.** `main` likely calls *removed* dotted names; live hub already serves grouped `repl` (health ok). Do this early. |
| **m03** | Option B pre-build — re-home the review loop | ✅ now | Re-home decisions 117 + 122 onto the Forge-regenerate surface; write the Forge-path confirm test. |
| **m04** | 🦸 **Option B build (HERO)** | ⛔ needs m02+m03 | Seed-once via `design_compose`, iterate locally via `patch_node`. |
| **m05** | Graph canvas (React Flow) | ✅ now | Parallel unblocked track; reuses the comment/anchor mechanism. |

**Startable today:** m01, m02, m03, m05. **Still gated:** hero m04 (needs m02 + m03). *(Forge replied 2026-06-10 — m02 is unblocked and urgent; see gotcha #3.)*

## Constraints & gotchas the build session MUST respect
1. **`rm -rf .next` before blaming a build failure.** A stale `.next` throws a misleading `TypeError: Cannot read properties of undefined (reading 'call')` on `/chat` prerender. This confounded the sprint-20 review until a cache-controlled A/B cleared it. The committed tree builds clean.
2. **The CMOS sprint-close gate checks `dist/`, but Next emits `.next/`** → expect `BUILD_STALE`/`dist-missing` and `forceComplete` on close. It's a mis-targeted gate, not a real failure. (Fix requested via backlog_request to `cmos-mcp-pro`.)
3. **Forge CONFIRMED the action-mode contract (s107) — ADOPT the OODS migration, EARLY.** As of Forge s107-m01b the dotted `repl.render`/`repl.validate` wire names are **removed** from the default surface; the live hub serves grouped `repl + {action}` (confirmed via `health`). So `main` (still calling dotted names) is likely **already broken against live Forge** — adopting `oods/forge-repl-action-migration` (`09ac670`) is urgent, not optional. Two notes: (a) the local `npm run verify:foundry-fragments --require-live` returned NO-GO **only because this shell had no Forge bridge env** — *not* a contract failure; configure the bridge env (or verify via the live MCP hub) to re-confirm `meta.label → data-oods-label` on the app's render path. (b) Forge's pending dist-rebuild + hub-restart affects only the stale `design_compose` *description text*, not the tool surface — it does not block adoption.
4. **Option B's review-loop coherence debt (do m03 before m04).** Suggest-and-confirm (decision 117) and comment↔change linkage (decision 122) are wired to the **local** `patch_node`/`set_document` tools. A headless-Forge regenerate is a different tool surface; treat it as `set_document`-shaped (mandatory agent-declared `addressesCommentIds` + fresh-anchor reconciliation). Otherwise the m10 endless-re-propose bug class loses its backstop.
5. **m04 acceptance gates (don't accept synthetic-only success):** (a) `data-oods-node-id` survives a *real* Forge regenerate (instance anchors don't orphan); (b) *one live Stage1 seed* flows end-to-end (real inspected app → Forge compose → review loop). Stage1 `inspect_app` is verified healthy as of 2026-06-10.
6. **assistant-ui stays pinned 0.11** (decision 102) — don't bump to 0.14; migrate off the view layer later.
7. **Port m09's prompt corrections** into any Forge-compose prompt: Text's real props are `text`/`value` (NOT `content`/`variant`); the catalog exposes `propSchema:{}` for primitives so the agent will invent props unless told otherwise. *(Forge is fixing this upstream in **s108** — `catalog.list` will surface primitives' real content/required props; keep the interim prompt hint + fallback until it lands.)*
8. **Anchor edge case (Forge, for m04):** a non-slot *leaf* child injected under a multi-component slot wrapper gets `data-oods-node-id` but **not** its own `data-oods-label` — the slot wrapper carries the label. Anchor on the slot/label, not the leaf.
9. **`repl.render` / compose CSS bloat:** `compact` defaults `false` → ~79KB token CSS inlined per render, which can blow result caps in an iterative Option-B loop. Pass `output:{compact:true}` (and/or `includeCss:false`) on regenerate calls. Forge is flipping the default in **s108**.

## Load-bearing decisions/learnings to read first
- **Decisions:** 119 (anchor schema flips A→B by `kind`, no UI rewrite), 116 (sandbox-iframe rect-broadcast bridge), 117 (suggest-and-confirm = gating the local tool-UI, LocalRuntime never calls executeTool), 122 (dual comment↔change linkage), 128 (m09 root cause), 113/114 (Forge `meta.label`→`data-oods-label`, verified on the *old* repl.render path).
- **Learnings:** id1/id4 (Workbench composes locally; Forge already emits anchors), id2 (vitest is type-blind — gate on `tsc`/`next build`), id8 (113/114 evidence stale under action-mode).
- **Investigation:** `cmos/reports/sprint-20-m07-forge-compose-investigation.md` (design_compose is a lossy scaffold — hence seed-once + local-iterate).

## Pending / cross-project
- **OODS replied (2026-06-10): contract confirmed** → adopt the migration (see gotcha #3). `meta.label → data-oods-label` confirmed for `design.compose` too. Only Forge's dist-rebuild + hub-restart for the `design_compose` *description* text remains pending on their side (non-blocking). Forge's **s108** will add primitive `propSchema` + flip the `repl.render` compact default.
- **Backlog_request open** → `cmos://derek/cmos-mcp-pro` (fix the `dist/`-vs-`.next/` build gate).
