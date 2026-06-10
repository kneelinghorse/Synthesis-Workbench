# s20-m07 pre-build investigation — the live Forge compose/anchor contract

**Date:** 2026-06-09 (session) · **Branch:** `reframe/review-surface`
**Author:** build session (Claude) — focused live-Forge investigation before the s20-m07 build
**Status:** s20-m07 left **Queued** — this brief de-risks the fresh session's design phase. Forge sprint-106 m01 (the hardened fragment-path contract test) had **not** landed at investigation time (empty inbox).

All findings below were **verified live** against the `oods-forge` MCP (`health`: 101 components, DSL 1.0, registry 2026-03-06) via `design_compose` + `repl_render`.

---

## TL;DR for the build

1. **The node-id contradiction is resolved.** Two different paths mint anchors differently:
   - **v1 (`repl.render` with a Workbench-built schema)** — Workbench supplies node ids; Forge **echoes** them as `data-oods-node-id` (verified earlier this session: we passed `t1`→got `data-oods-node-id="t1"`). Stable because Workbench owns the ids and `patch_node` preserves them. **This is why v1 instance anchors are safe.**
   - **Option B (`design_compose` from intent)** — Forge **mints** ids as `` `${slotName}-${counter}` `` (e.g. `slot-hero-2`, `landing-section-0-4`, `slot-footer-14`; counter 1..N in traversal order). The counter **renumbers on any structural add/remove/reorder** → `data-oods-node-id` is **best-effort only** here.
2. **`data-oods-label` is the durable anchor.** It equals `node.meta.label` = the **slot name** (`hero`, `hero-cta`, `section-0`, `metrics`, `cta`, `footer`), which carries **no counter** and is structure-independent. The `format:fragments` render emits **both** attrs on every node (parity already observable — see §3).
3. **`design_compose` is a lossy SCAFFOLD, not content-preserving regeneration.** This is the most important design finding and reshapes what "regenerate via Forge" can mean — see §4.

---

## 1. `design_compose` contract (verified)

Call: `design_compose({ intent, layout })` → returns `{ status, layout, schema, schemaRef, schemaRefCreatedAt/ExpiresAt (30-min TTL), selections[], validation, meta }`.

- `schema` is a full UiSchema: `{ version, screens:[{ id, component:"Stack", children:[…] }] }`.
- Every slot node carries `meta`: `{ intent: "slot:<name>", label: "<name>", confidence, confidenceLevel }`.
- `selections[]` gives, per slot: `slotName`, `selectedComponent`, `confidence`, `candidates[]` (+ `alternativeCandidates`/`reviewHint` for low-confidence slots).
- `schemaRef` (e.g. `compose-d3637ba3`) feeds `repl_render({ schemaRef })` / `schema_save` / `code_generate`. Expires in 30 min — `schema_save` to persist.

**Node-id minting (verified):** landing compose produced ids `screen-landing-15`, `landing-hero-1`, `slot-hero-2`, `slot-hero-cta-3`, `landing-section-{0,1,2}-{4,6,8}`, `slot-section-{0,1,2}-{5,7,9}`, `landing-cta-11`, `slot-cta-12`, `landing-footer-13`, `slot-footer-14`. Pattern = `` `${semanticName}-${counter}` ``, counter assigned in traversal order. **Add/remove/reorder shifts the counter for all later nodes** → instance (node-id) anchors are not durable on this path.

**Label durability + uniqueness (verified):** `meta.label` = the slot name and is unique *within a template* because Forge **self-indexes** repeated slots (`section-0/1/2`). So within one compose, labels are effectively unique. The non-uniqueness risk the mission warns about is real for (a) the agent filling a container slot (`Stack`/`Grid`) with N children that may share/lack a label, and (b) cross-screen repeats. → keep the **disambiguator** (nearest ancestor label) in the anchor model, but note labels are *more* unique than feared on the pure-template path.

## 2. The two render paths side by side

| | v1 — `repl.render` w/ Workbench schema | Option B — `design_compose` |
|---|---|---|
| Who assigns node ids | Workbench (`component.id`) | Forge (`${slot}-${counter}`) |
| `data-oods-node-id` | echoes our id → **stable** | minted counter → **best-effort** |
| `data-oods-label` | from `meta.label` (s20-m06: props.label/title stopgap) | from `meta.label` = **slot name** (durable) |
| Content | Workbench-authored props (real copy) | **empty slots** (placeholder = slot name) |

## 3. Fragment render parity (verified)

`repl_render({ schemaRef, apply:true, output:{ format:"fragments", compact:true, includeCss:false } })` → each fragment's html carries **both** anchors, e.g.:

```html
<p id="slot-hero-2" data-oods-component="Text" data-oods-node-id="slot-hero-2" data-oods-label="hero">hero</p>
<button id="slot-hero-cta-3" ... data-oods-node-id="slot-hero-cta-3" data-oods-label="hero-cta">hero-cta</button>
```

So the `format:fragments` path **already emits `data-oods-label`** (the parity Forge said sprint-106 m01 would harden/contract-test). The design-time gate is observably satisfied; m01 adds the formal guarantee. **Watch the inbox** before depending on the *hardened* guarantee, but the shape is confirmed.

> Tooling note: call `repl_render` with `output.compact:true` + `includeCss:false`. The default inlines ~84KB of token CSS and blows the MCP result cap; compact makes iterative render-debugging cheap.

## 4. ⚠️ `design_compose` is a lossy scaffold — reshapes "regenerate via Forge"

Verified twice:
- Landing intent ("header text + info card + action button") → a generic **hero + 3 empty sections + cta + footer**, every slot **empty** (rendered slots show the *slot name* as placeholder, e.g. `<p…>hero</p>`). The "info card" became 3 `Button`-filled `Card` sections (low-confidence picks).
- Dashboard intent ("**four** KPI cards: revenue, users, conversion, churn") → **one** `slot-metrics` Card in a 4-col Grid. The count and the specific metrics were **not** realized.

**Implication:** `design_compose(intent)` does layout-template selection + per-slot component selection, **coarsely**. It does **not** faithfully realize counts/content, and it returns **no content props**. A naive "regenerate = call `design_compose` again each turn" would **discard the human's content and structure** — the opposite of the review→iterate loop. There is **no** Forge "recompose-preserving-content" / "patch existing schema" entry in the catalog (`design_compose` = intent→scaffold; `repl_render` = schema→html; also `repl_validate`, `pipeline`, `schema_save/load`, `code_generate`).

**Therefore the operational meaning of "agent regenerates via headless Forge" must be settled with Derek before building.** Strong recommendation from the evidence:
- **Option B = "seed via Forge, then iterate locally," NOT "re-compose from intent every turn."** Use `design_compose` for the **initial** structure (real Forge slot labels + scaffold), Workbench **ingests** it (persisting `meta.label` per node — adapter option (b)), then keep iterating with the existing v1 `patch_node`/`set_document` (which preserve content + ids). The agent calls Forge compose when the human wants a **structural/from-scratch** regeneration, accepting it's a reset.
- A content-preserving "recompose" (re-pick components/layout while keeping copy) would be a **Workbench-owned merge** (map old content onto new slots by label) or a **new Forge capability** (cross-project ask to OODS-Forge).

## 5. Concrete build guidance (when m07 starts)

- **FoundryMcpClient** (`src/lib/mcp/foundry-client.ts`): add a `compose(intent, {layout, preferences})` method that calls the bridge `design.compose` via the existing `callTool` (proxy `/api/foundry/run` is a transparent pass-through — no whitelist change). Return `{ schema, schemaRef, selections }`. Then render via the existing `repl.render({ schemaRef, output:{format:"fragments"} })` path the adapter already uses.
- **CommentAnchor** (`src/lib/stores/comment-state.ts`): add `kind:"entity-slot"` with `slotLabel` (= `data-oods-label`) **+ a `disambiguator`** (nearest ancestor's `data-oods-label`). Keep `instance` for the v1 local-patch path. `anchorFromPreview`/`anchorMatchesPreview` extend to match on label+disambiguator. The s20-m10 anchor-match logic (`commentsAddressedByChange`) and the inject-script `ANCHOR_SELECTOR` (`[data-oods-node-id],[data-oods-label]`) already accommodate label anchors — minimal churn.
- **Adapter option (b)** (`src/lib/engine/foundry-fragment-adapter.ts` + `ComponentNode`): add `meta?:{ label?:string }` to `ComponentNode`, persisted from Forge's composed `meta.label` (the slot name), replacing the s20-m06 `props.label/title` stopgap (decision 115). The adapter already forwards a child `meta.label` to Forge (line ~286); make it round-trip the durable slot name on ingest.
- **Low-confidence slots** are a natural review-surface signal: `design_compose` returns per-slot `confidence` + `reviewHint`, and `repl_render` has `output.showConfidence` → `data-oods-confidence` / `oods-low-confidence`. Consider surfacing these as review affordances (ties into the reframe).

## 6. Open questions for Derek (before/at m07 start)

1. **What does "regenerate via Forge" mean operationally** — seed-then-iterate (recommended, §4) or per-turn recompose (lossy)? This decides the whole mission shape.
2. If content-preserving recompose is wanted, is that a **Workbench merge** or a **Forge cross-project ask**?
3. Wait for **Forge sprint-106 m01** ping before relying on the hardened label-durability contract (the shape is already observable; the guarantee isn't formal yet).

---

### Cross-project signals logged for OODS-Forge (via mission feedback this session)
- Live `catalog_list` returns `propSchema:{}` for the primitive components (Text/Button/Card/Stack/…), so consumers can't tell the agent the real content prop — this is the upstream cause of the s20-m09 render-bug class.
- `repl_render` inlines ~84KB token CSS by default; `output.compact:true` is the workaround but is off by default for `repl.render`.
