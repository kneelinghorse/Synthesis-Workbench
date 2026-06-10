# s21-m04 (HERO) build handoff — agent regenerates via headless Forge

**For the fresh session.** m04 is the only remaining sprint-21 mission. Its
dependencies are now MET (m02 Forge action-mode contract is live; m03 laid the
contract + seams + tests). This doc is everything needed to execute it cleanly.

## Live de-risking (done this session — both deps verified working)

**`design_compose` is live and returns what Option B needs.** A `landing` compose
(`mcp__aquex__oods-forge__design_compose`, intent + `layout:"landing"`) returns a
full UiSchema (`version 2026.02`) where **every slot child carries `meta.label`**
(`hero`, `hero-cta`, `section-0/1/2`, `cta`, `footer`) + `meta.intent` (`slot:hero`)
+ `confidence`. Node ids are **`${slot}-${counter}`** (`slot-hero-2`,
`landing-section-0-4`) → they renumber on any structural change, so **instance
ids are fragile; `meta.label` is the durable anchor** (confirms decisions 137/141).
It also returns `selections[]` with per-slot `confidence` + `reviewHint`, and
`meta.lowConfidenceSlotNames` — real review-surface signal (e.g. the `section-*`
picks came back at 0.26). Returns a `schemaRef` (TTL 30 min — `schema.save` to
persist).

**Stage1 seed = Linear (Derek's pick).** Only `example.com` runs are cached;
no Linear run exists yet. Run a fresh `stage1_inspect_app({ url, components:true,
infer:true })` on a public Linear page (the marketing/landing page — avoid
auth-walled app routes), then `stage1_oods_bridge({ runDir })` → `design.compose`
payload → `design_compose` → render → review loop. The crawl is heavy (route
discovery + a11y/perf/network); keep `maxPages`/`crawlDepth` modest.

## Build plan (pieces, in dependency order)

1. **`FoundryMcpClient.designCompose`** — new method on the client
   (`foundry-client.ts`: add to the type at `:43-54`, impl ~`:782` alongside
   `fetchStructuredData`, calling the shared `callTool` at `:632`). ⚠️ Confirm the
   exact wire name under the action-mode contract — the hub tool is `design_compose`;
   check the bridge allowlist (`OODS-Forge/packages/mcp-bridge/src/config.ts`) for
   whether it's `design_compose` / `design.compose` / a grouped tool.

2. **`ComponentNode.meta?: { label?: string }`** in `src/types/document-model.ts`
   — the "adapter option (b)" my m03 doc flagged. Persist Forge's composed
   `meta.label` so it survives into the Workbench document model and out to
   `data-oods-label` on render.

3. **KEYSTONE — UiSchema → DesignDocument converter.** `design_compose` returns a
   Forge UiSchema (screens/children with `component`, `meta.label`, `layout`,
   `style.spacingToken`), NOT a Workbench `DesignDocument`. Build the reverse of
   `foundry-fragment-adapter`/`buildFoundryFragmentRenderInput`: map screens/children
   → `LayoutNode`/`ComponentNode`, **preserving `id` AND `meta.label`**. Unit-test
   it against the captured compose output (the landing example in the mission log).

4. **`forge_regenerate` tool** — reuse m03 verbatim:
   `src/lib/runtime/tools/forge-regenerate-tools.ts` already has
   `confirmForgeRegenerate` / `rejectForgeRegenerate` / `forgeRegenerateCommentLink`
   / `reconcileAnchorsAfterRegenerate` (+ 11 passing tests). Wire:
   `tool-definitions.ts` (reuse `ADDRESSES_COMMENT_IDS_SCHEMA` but **required**) →
   executor: `designCompose(intent/seed)` → convert (#3) → `confirmForgeRegenerate(doc)`
   → `forgeRegenerateCommentLink` → `resolveCommentsForChange` →
   `reconcileAnchorsAfterRegenerate(open, newAnchors)`. Register + **guard** in
   `withToolCommands.ts` (`:969-1028`, guard like `:988-995`) so it only runs through
   the confirm UI. Tool UI: extend `DocumentToolUI` or add a `RegenerateToolUI`.

5. **Decision-119 `instance→entity-slot` anchor flip** (criterion 5). In
   `comment-state.ts`: `CommentAnchorKind += "entity-slot"`, `CommentAnchor +=
   disambiguator?` (nearest ancestor's `data-oods-label`); `anchorFromPreview`
   prefers the durable label (+ disambiguator) on the regenerate path; update
   `anchorMatchesPreview` / `anchorKey`. Then upgrade
   `reconcileAnchorsAfterRegenerate` to actually RE-PIN by entity-slot (m03 left it
   survive/orphan-only, pending 119). The graph canvas (m05) needs no change — it
   already pins by `{kind}` via the same schema.

## Acceptance gates (decision 134 — do NOT fake these)

- **Gate 1:** an anchored comment survives a real Forge regenerate. Test live
  against `:4466`: compose → render → capture anchors → regenerate with a structural
  change → confirm a durable-label-anchored comment does NOT orphan (and that an
  instance-only anchor DOES, per m03 — which is *why* #5 flips to entity-slot).
- **Gate 2:** one live Stage1 (Linear) seed flows end-to-end (real inspected app →
  `design_compose` → review loop) through the Workbench. This is the
  s16-m04 synthetic-success guard — it must be a REAL inspected app, not a fixture.

## Environment state at handoff

- **Local foundry bridge (:4466)** is now a FRESH standalone process serving the
  grouped/action-mode contract (started via `npm run dev:foundry`). The
  `dev-services.js` supervisor (was PID 35430) manages next(:3000)+stage1(:3200);
  it will re-adopt the fresh foundry bridge on its next health check/restart. If
  the fresh bridge is gone, restart with `npm run dev:foundry`.
- **m01 build-health gate is enforced** — pre-push runs `typecheck`+`build`; CI on
  push to main. Keep both green.
- `main` carries m01/m02/m03/m05; the m02 merge is `c257962`.

## Gotchas

- design_compose returns a Forge UiSchema, NOT a `DesignDocument` → conversion (#3)
  is the load-bearing piece. Don't skip it or comments/patch_node iterate break.
- `meta.label` is durable but NOT unique within a doc (N slot children;
  cross-screen repeats) → the entity-slot **disambiguator** (#5) is required for
  collision-safe re-pinning before UNATTENDED regenerate.
- Port m09 `PRIMITIVE_PROP_GUIDANCE` (`catalog.ts:61-62`) into the compose tool
  description (m03 doc §3): real prop is `text`/`value`, never invent
  `content`/`variant` (silently dropped → empty render).
- `schemaRef` TTL is 30 min — re-compose or `schema.save` for longer flows.
- "seed-once via design_compose, then iterate locally via patch_node" (Derek's
  confirmed shape) — design_compose is the SEED; iteration reuses existing
  `patch_node`. Don't recompose every turn.
