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
| **m02** | Adopt the Forge action-mode contract | ⛔ OODS | Live-verify + merge the quarantine branch. Soft-blocked on OODS reply. |
| **m03** | Option B pre-build — re-home the review loop | ✅ now | Re-home decisions 117 + 122 onto the Forge-regenerate surface; write the Forge-path confirm test. |
| **m04** | 🦸 **Option B build (HERO)** | ⛔ needs m02+m03 | Seed-once via `design_compose`, iterate locally via `patch_node`. |
| **m05** | Graph canvas (React Flow) | ✅ now | Parallel unblocked track; reuses the comment/anchor mechanism. |

**Startable today:** m01, m03, m05. **Soft-blocked on OODS reply:** m02 + hero m04.

## Constraints & gotchas the build session MUST respect
1. **`rm -rf .next` before blaming a build failure.** A stale `.next` throws a misleading `TypeError: Cannot read properties of undefined (reading 'call')` on `/chat` prerender. This confounded the sprint-20 review until a cache-controlled A/B cleared it. The committed tree builds clean.
2. **The CMOS sprint-close gate checks `dist/`, but Next emits `.next/`** → expect `BUILD_STALE`/`dist-missing` and `forceComplete` on close. It's a mis-targeted gate, not a real failure. (Fix requested via backlog_request to `cmos-mcp-pro`.)
3. **Do NOT adopt the OODS migration without live-verifying it.** Branch `oods/forge-repl-action-migration` (`09ac670`, pushed to origin) migrates Forge calls `repl.render`/`repl.validate` → `repl + {action}`. It builds + passes unit tests, but its **live action-mode contract is un-re-verified** — decisions 113/114's "verified LIVE" evidence predates the rename (learning #8). m02 gates on `npm run verify:foundry-fragments --require-live` + OODS confirmation.
4. **Option B's review-loop coherence debt (do m03 before m04).** Suggest-and-confirm (decision 117) and comment↔change linkage (decision 122) are wired to the **local** `patch_node`/`set_document` tools. A headless-Forge regenerate is a different tool surface; treat it as `set_document`-shaped (mandatory agent-declared `addressesCommentIds` + fresh-anchor reconciliation). Otherwise the m10 endless-re-propose bug class loses its backstop.
5. **m04 acceptance gates (don't accept synthetic-only success):** (a) `data-oods-node-id` survives a *real* Forge regenerate (instance anchors don't orphan); (b) *one live Stage1 seed* flows end-to-end (real inspected app → Forge compose → review loop). Stage1 `inspect_app` is verified healthy as of 2026-06-10.
6. **assistant-ui stays pinned 0.11** (decision 102) — don't bump to 0.14; migrate off the view layer later.
7. **Port m09's prompt corrections** into any Forge-compose prompt: Text's real props are `text`/`value` (NOT `content`/`variant`); the catalog exposes `propSchema:{}` for primitives so the agent will invent props unless told otherwise.

## Load-bearing decisions/learnings to read first
- **Decisions:** 119 (anchor schema flips A→B by `kind`, no UI rewrite), 116 (sandbox-iframe rect-broadcast bridge), 117 (suggest-and-confirm = gating the local tool-UI, LocalRuntime never calls executeTool), 122 (dual comment↔change linkage), 128 (m09 root cause), 113/114 (Forge `meta.label`→`data-oods-label`, verified on the *old* repl.render path).
- **Learnings:** id1/id4 (Workbench composes locally; Forge already emits anchors), id2 (vitest is type-blind — gate on `tsc`/`next build`), id8 (113/114 evidence stale under action-mode).
- **Investigation:** `cmos/reports/sprint-20-m07-forge-compose-investigation.md` (design_compose is a lossy scaffold — hence seed-once + local-iterate).

## Pending / cross-project
- **Awaiting OODS reply** → `cmos://derek/oods-foundry-mcp` (action-mode contract + `meta.label` under action-mode). Unblocks m02 + m04.
- **Backlog_request open** → `cmos://derek/cmos-mcp-pro` (fix the `dist/`-vs-`.next/` build gate).
