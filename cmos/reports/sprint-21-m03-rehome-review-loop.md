# s21-m03 — Re-home the review loop onto a headless-Forge regenerate (pre-build)

**Mission:** capture the design decision + tests for how the suggest-and-confirm
review loop maps onto a full headless-Forge regenerate, **before** the compose
code (m04) is written. This is the biggest unflagged coherence debt carried out
of sprint-20.

**Status:** design + contract + tests landed. The live Forge `design.compose`
call, the agent tool definition, and the Tool UI are explicitly **m04**.

Artifacts:
- `src/lib/runtime/tools/forge-regenerate-tools.ts` — contract (pure helpers + reconciliation)
- `src/lib/runtime/tools/forge-regenerate-tools.confirm.test.ts` — 11 tests, mirrors `document-tools.confirm.test.ts`

---

## 1. Decision — a regenerate is `set_document`-shaped (re-homes 117 + 122)

A full headless-Forge regenerate (`design.compose`) replaces the **whole**
document. That makes it `set_document`-shaped, so it **reuses** the existing
review-loop machinery rather than forking it:

| Concern | v1 local | Forge regenerate (Option B) | Re-homing |
| --- | --- | --- | --- |
| Confirm gate (dec. 117) | Tool UI stays `requires-action`; Accept→`confirmSetDocument`, Reject→`rejectSetDocument` (`DocumentToolUI.tsx:116-135`) | identical | `confirmForgeRegenerate` delegates to `confirmSetDocument`; `rejectForgeRegenerate` → `rejectSetDocument` |
| Comment↔change link (dec. 122) | dual: declared `addressesCommentIds` **+** `patch_node` instance auto-match (`componentId===nodeId`) | declared ids **only** — there is no single nodeId; Forge re-mints ids so auto-match can't apply | `forgeRegenerateCommentLink` = `{commentIds}` on `saved`, null otherwise |
| `addressesCommentIds` | optional | **MANDATORY** (typed `string[]`, not `string[]?`) | without it the m10 endless-re-propose backstop is lost |
| Anchors | instance ids survive (patch_node preserves them) | instance ids do **not** survive (see §2) | fresh-anchor reconciliation pass |

**Why mandatory ids:** a wholesale rewrite has no target node for the auto-match
safety net (`commentsAddressedByChange`, `comment-state.ts:204-224`). Forge mints
node ids as `${slot}-${counter}` and the counter shifts on any structural
add/remove/reorder, so an instance anchor cannot recover a comment after a
regenerate. The agent's declared ids are the **only** durable linkage; if the
agent omits them, accepted regenerates would never resolve their comments and the
m10 endless-re-propose bug class returns. Hence the type requires the field and
the m04 tool schema must mark it `required`.

**Why reuse, not fork:** the confirm gate and apply path are proven and
unit-tested. Delegating keeps a single source of truth for "Accept applies / Reject
is a pure no-op / comments resolve only on a real apply" and gives m04 a thin,
named seam (`forge_regenerate`) to register a distinct tool + Tool UI against.

## 2. Fresh-anchor reconciliation approach

After a regenerate the preview is composed from scratch with **new** anchors.
Durability (from `cmos/reports/sprint-20-m07-forge-compose-investigation.md`):

- **Instance anchors** (`data-oods-node-id`) are **fragile** — `${slot}-${counter}`,
  counter renumbers on structural change.
- **Slot labels** (`data-oods-label` = `meta.label`) are **durable** — no counter,
  structure-independent — but **not unique** within a document (N children in a
  container slot; cross-screen repeats).

`reconcileAnchorsAfterRegenerate(openComments, newAnchors)` classifies every OPEN
comment, **conservatively**:

- `slot` anchor → **survived** iff its label is present **exactly once**; a
  vanished label or a **collision** (>1) → **orphaned** (no false-positive re-pin).
- `instance` anchor → **survived** iff Forge kept the exact id; otherwise
  **orphaned** (a v1 instance anchor carries no durable label to recover from).
- **orphaned** comments stay in the store and render **detached/flagged** — never
  silently resolved (that would drop the human's critique) and never pinned to an
  ambiguous candidate.

**Design recommendation:** pin regenerate-path comments to the **durable slot
label**, not the instance id, so they survive by construction (an exact label
match). The full fix is **decision 119**'s `entity-slot` anchor (label + a
disambiguator = nearest ancestor's `data-oods-label`) so colliding labels can be
told apart; that flip is a prerequisite for **unattended** regenerate and is still
pending. Until then, reconciliation orphans on ambiguity rather than mis-pinning.

> Open follow-up for m04: persist Forge's composed `meta.label` onto
> `ComponentNode` (adapter option (b)) and flip `anchorFromPreview` to prefer the
> durable label on the regenerate path, so reconciliation matches by label.

## 3. m09 prompt corrections → Forge-compose prompt plan

The m09 fix (commit `d3c7684`) lives in `PRIMITIVE_PROP_GUIDANCE`
(`src/lib/foundry/catalog.ts:61-62`): **Text's real prop is `text`/`value`, NOT
`content`/`variant`; unknown props are silently dropped and the component renders
EMPTY; never invent props.** It is already injected into both the Foundry and
fallback catalog prompts (`catalog.ts:203,365`).

When m04 builds the `forge_regenerate` tool, its description must:
1. **Restate** `PRIMITIVE_PROP_GUIDANCE` — primitives expose `propSchema:{}`, so the
   agent will invent props unless told the real names (check the required-props list).
2. Frame `design.compose` as **structural / seed-once**, then iterate locally via
   `patch_node` (Derek's confirmed shape) — not a per-turn full recompose.
3. Require `addressesCommentIds` on every regenerate call (§1).
4. Anchor critique on the durable slot/`meta.label` (§2), not the node id.
5. Pass `output:{ compact:true, includeCss:false }` on the loop's `repl` calls to
   avoid CSS bloat.

## 4. m04 wiring seams (where the compose code plugs in)

- `FoundryMcpClient`: add `designCompose` alongside render/validate/buildTokens/
  fetchStructuredData (`foundry-client.ts:43-54`, impl ~782) calling the shared
  `callTool` (`:632`) with the grouped Forge tool (post-s21-m02 contract).
- Tool definition: add `forge_regenerate` in `tool-definitions.ts` reusing
  `ADDRESSES_COMMENT_IDS_SCHEMA` (`:38-43`) but **required**.
- Dispatcher: register + **guard** `forge_regenerate` in `withToolCommands.ts`
  (`:969-1028`, guard like `:988-995`) so it only executes through the confirm UI.
- Tool UI: Accept → `confirmForgeRegenerate` → `forgeRegenerateCommentLink` →
  `resolveCommentsForChange` → `reconcileAnchorsAfterRegenerate(open, newAnchors)`.

## 5. Acceptance gates carried to m04 (decision 134)

Both are things local compose structurally cannot prove:
1. `data-oods-node-id` survives a real Forge regenerate (instance-anchored
   comments do not orphan) — **or** the comment is durably label-anchored per §2.
2. One live Stage1 seed flows end-to-end (real inspected app → `design.compose` →
   review loop) — guards against the s16-m04 synthetic-success trap.
