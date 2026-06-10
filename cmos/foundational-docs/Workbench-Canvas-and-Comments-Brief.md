# Workbench Review Surfaces — Comment Layer + Graph Canvas

**Date:** 2026-06-03
**From:** OODS Foundry (Forge) side
**For:** Synthesis Workbench team
**Status:** Design brief / implementation direction (not yet scheduled)

---

## TL;DR

We want humans to be able to **look at what Forge generates, react to it, and have an agent make the changes** — without Forge growing a UI of its own. Forge stays headless; Workbench becomes the place that work happens. Two pieces:

1. **Comment layer (near-term).** A click-and-comment layer over Workbench's existing HTML preview — point at an element, leave a critique (like a Word comment or the Stripe design-review demo). A human never edits directly; they flag, the agent edits.
2. **Graph canvas (later).** A lightweight React Flow canvas, **inside Workbench**, for site maps, flow maps, and information architecture. Forge generates the graph; a human rearranges and annotates it; the agent reads the changes and regenerates.

Both run on the **same loop and the same trick**: every element Forge emits carries a stable ID, feedback is pinned to those IDs, and the agent uses them to tell Forge what to change. The comment layer and the canvas annotations are the same pattern applied to two different surfaces.

---

## Background: the three systems

For shared context (you know Workbench; this is how the pieces line up):

- **Stage1** scans real websites and produces structured reports of the components it found.
- **Forge** (OODS Foundry MCP) is a **headless** server: it takes a design definition and generates artifacts from it — diagrams, wireframes, branded mockups, production code, and machine-readable JSON — and validates them. No UI of its own, on purpose.
- **Workbench** is the consumer app: agent chat + live preview, already wired over MCP to **both** Forge and Stage1.

Forge can *generate*, but today there is no way for a person to view a result, react to it, and iterate — except by talking to the agent. This brief closes that gap, and does it by extending Workbench (which already owns the expensive plumbing) rather than building a new app.

---

## The vision: Workbench as the iterate-and-review workspace

Reframe Workbench from "the chat app" to **the place you review and iterate on generated work**, with more than one surface onto a single loop:

```
   ┌─────────────── one loop ───────────────┐
   │  human feedback pinned to stable IDs    │
   │        │                                │
   │        ▼                                │
   │   agent reads feedback ──► Forge regenerates ──► new artifact
   │        ▲                                          │
   │        └──────────── human reviews ◄──────────────┘
   └─────────────────────────────────────────┘

   Surfaces that feed this loop:
   • chat            — express intent in words
   • HTML preview    — critique a rendered design (comment layer)
   • graph canvas    — rearrange & critique a site map / flow / IA
```

The key idea: the comment layer and the canvas annotations are **not two features** — they're the same "feedback pinned to stable IDs → agent → Forge regenerate" mechanism on two render surfaces. Build it once, apply it twice.

---

## Deliverable 1 — Comment layer on the HTML preview (near-term)

**What it is.** Over the rendered preview, a human can click an element and leave a comment — highlight-and-comment like Word, or click-and-critique like the Stripe web-design-review demo. **Critique, not edit:** the human flags "this title is wrong / this section should move / tighten this copy," the agent collects those notes and makes the changes by calling Forge.

**Why it's a clean fit (most of it already exists):**

- **Forge already stamps stable anchors on every meaningful element** of its HTML output — the entity it belongs to and the slot it fills (`data-entity-urn`, `data-slot-name`, `data-slot-field`, `data-element-type`, `data-role`). There is a cross-emitter test that enforces these stay consistent. That means a comment can be pinned to *"the title slot of the Article"* — a logical anchor — not a fragile pixel position. When Forge regenerates, the comment still points at the right thing.
- **Workbench already renders that HTML in a sandboxed iframe** (`PreviewPane.tsx`, `srcDoc` + parent↔iframe `postMessage`). The comment layer attaches right here.

**Mechanism:**

1. Inject a small selection script into the preview HTML. On click, it finds the nearest element carrying a Forge anchor and reads that ID.
2. It `postMessage`s the anchor (+ any text selection) up to the Workbench parent.
3. Workbench opens a comment box and stores the comment **keyed by the anchor**.
4. When the human is done, Workbench hands the agent the original design definition + the structured list of comments (each tied to an anchor).
5. The agent calls Forge's existing compose/regenerate tools and the new HTML renders. Comments survive because they're keyed to logical IDs, not positions.

**Split of work:**

- *Forge provides:* the HTML with stable anchors (already shipped); the regenerate path (existing tools).
- *Workbench builds:* the in-iframe selection script, the comment UI, the comment store keyed by anchor (the project model already has an `annotations` field to build on), and the package-and-handoff-to-agent step.

**Non-goals:** no direct editing of the design in the preview; no freeform drawing. Comment = critique; the agent does the editing.

---

## Deliverable 2 — Graph canvas for site maps / flows / IA (later)

**What it is.** A lightweight, Miro/Whimsical-style canvas — **but only for node-and-edge structure**: site maps, flow maps, information architecture. Not pixel-level visual design. Forge generates the graph; a human drags things around and annotates them; the agent reads the result and regenerates.

**Where it lives: inside Workbench, as its own dedicated surface.** Not a 4th app. Reasoning: the canvas (rendering a graph) is the cheap part; the expensive parts — the MCP connections to Forge and Stage1, the agent runtime, persistence, and the very same comment mechanism from Deliverable 1 — already exist in Workbench. A standalone app would re-pay all of that to get a graph view. React Flow is a React component and Workbench is React/Next, so it drops in natively.

**Keep it clean:** build the canvas as an **isolated feature module** — its own route (a top-level mode you switch *to*, e.g. `/canvas`, not a panel crammed beside the chat), its own components, its own state slice. It ships fast by reusing existing plumbing, stays cohesive as its own focused surface, and is isolated enough to lift out later if it ever needs to.

**The round-trip (why this works cleanly):**

- Forge emits a node/edge graph with stable IDs. React Flow's `nodes`/`edges` props **are exactly that shape** (`{id, position, data, type}` / `{id, source, target}`), so Forge's output *is* the canvas's data — no lossy import/parse.
- Every human edit comes back as a structured callback (`onNodesChange`, `onEdgesChange`, `onConnect`), and `toObject()` serializes the whole graph to JSON, **keyed by the same IDs Forge emitted**. The agent reads moves, new edges, deletions, and annotations directly and maps them back to Forge's model.

**Split of work:**

- *Forge provides:* a node/edge graph artifact/tool with stable IDs (a natural sibling to the boxes-and-arrows output it already produces). Optional quick win: emit **Mermaid** text too, for instant static previews with near-zero effort.
- *Workbench builds:* the React Flow module (route, components, state slice); auto-layout (React Flow doesn't place nodes for you — pair with `dagre` or `elkjs`); the same comment/annotation overlay from Deliverable 1, applied to nodes; persistence of the working graph; the feedback-to-agent handoff (reusing the agent + MCP wiring it already has).

**Non-goals:** not a visual-design canvas; site-maps/flows/IA only. Comments/critique come first; **direct structural manipulation that has to mean something** (e.g. "I moved this box, so change the model") is a deliberate, separate, later question — don't let it make the first version heavy.

---

## Why React Flow (and not Miro / Whimsical / FigJam / tldraw / Excalidraw / draw.io)

We checked each tool against the one thing that matters: **can Forge draw the diagram headlessly, and can the agent read the human's rearranging *and* comments back as structured data** (verified against current docs, June 2026):

| Tool | Forge can draw it | Agent reads rearranges | Agent reads comments | Cost |
|---|---|---|---|---|
| Miro | yes | yes (poll) | **no (API won't return comments)** | paid SaaS |
| Whimsical | yes (new agent connector) | weak (text/image, no stable IDs) | yes | paid SaaS |
| FigJam | **no (needs a human in the editor)** | yes | yes | paid SaaS |
| tldraw | yes | yes | no (none built in) | **$6k/yr or watermark** |
| Excalidraw | yes | yes | no (paid tier) | free (MIT) |
| **React Flow** | **yes (our JSON is its data)** | **yes — cleanest** | no (we build it) | **free (MIT)** |
| draw.io | yes | yes | host-dependent | free (Apache) |
| Mermaid | yes | **no (static image)** | no | free (MIT) |

The hosted tools don't close our loop: **Miro can't return comments** (and removed change-notifications in Dec 2025), and **FigJam can't even generate a diagram without a person running a plugin in the editor**. Whimsical recently got better (an official agent connector that creates diagrams and reads comments) but its structural round-trip with stable IDs is unproven. The free embeddable libraries win because Forge's output becomes the canvas's data and the IDs survive the round-trip. **React Flow** is the strongest fit for structured flow/IA work; Excalidraw is the alternative if a looser hand-drawn feel is preferred; tldraw is the most polished out-of-the-box but carries a real license cost.

Note: **every option means we build the comment layer ourselves** — but that's the *same* stable-ID overlay we're already building in Deliverable 1, reused. So it isn't extra cost.

Treat Miro/Whimsical as optional **"publish a copy here" export targets** if ever wanted — not the surface the loop is built on.

---

## Architecture / where things live

```
Stage1 ──(reports)──► Workbench ◄──(MCP)──► Forge (headless)
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
     chat          HTML preview         graph canvas
                   + comment layer      (React Flow)
                          │                 │
                          └──── same comment/feedback mechanism ────┘
                                   (pinned to Forge's stable IDs)
```

- **Forge** stays headless and is the source of truth for the semantic model. It generates artifacts (HTML, node/edge graph, code) and regenerates on request. No UI added to Forge.
- **Workbench** is the workspace: it holds the working copy while a human edits, runs the agent, and owns all the human-facing surfaces.
- **The canvas and the comment layer are sibling surfaces inside Workbench**, both feeding the same agent→Forge loop.
- **Stable IDs are the contract** between Forge's output and Workbench's feedback: Forge stamps them, Workbench pins feedback to them, the agent uses them to tell Forge what to change.

---

## Forge ↔ Workbench contract

| Concern | Forge (headless) | Workbench |
|---|---|---|
| HTML render with stable anchors | provides (shipped) | renders in preview iframe |
| Node/edge graph with stable IDs | provides (new, small) | renders in React Flow |
| Mermaid text (quick static preview) | provides (optional, cheap) | displays |
| Comment/selection capture | — | builds (in-iframe script + UI) |
| Comment store keyed by anchor | — | builds (extend project model) |
| Canvas module (route, components, state) | — | builds |
| Auto-layout (dagre/elkjs) | — | builds |
| Agent runtime + MCP wiring | exposes tools | already has it |
| Regenerate from feedback | provides tools | orchestrates the agent call |

---

## Suggested sequencing

1. **Comment layer on the HTML preview** (Deliverable 1) — highest value, smallest build, reuses the existing iframe + anchors.
2. **Mermaid quick preview** (optional, near-free on the Forge side) — gives a static site-map/flow preview while the full canvas is built.
3. **React Flow canvas module** (Deliverable 2) — the structured node/edge surface, reusing the comment mechanism from step 1.
4. **(Later, separate decision)** structural direct-manipulation — letting a human's moves change the model, not just annotate it.

---

## Open questions

- **Graph artifact shape.** Exact schema for the node/edge graph Forge emits (node types for IA vs flow, edge semantics, what metadata rides along). Forge side to propose; Workbench to confirm it maps to React Flow cleanly.
- **Persistence.** Where the working copy + comments + canvas state live (extend Workbench's existing project model vs a new store).
- **Comment-to-change fidelity.** How literally the agent applies a critique (suggest-and-confirm vs auto-apply), and how that's surfaced back to the human.
- **Auto-layout choice.** `dagre` vs `elkjs` for placing Forge-generated graphs — pick during the canvas build.

---

## Non-goals (consolidated)

- Forge does **not** grow a UI — it stays headless.
- The comment layer is **critique, not editing** — the human flags, the agent changes.
- The canvas is for **site maps / flows / IA only** — not pixel-level visual design.
- **Not** building the loop on Miro/Whimsical/FigJam (export targets at most).
- Structural direct-manipulation is **out of scope for v1** — a later, separate decision.

---

## Appendix — sources for the tool comparison (verified June 2026)

- Miro REST API + comments gap: developers.miro.com/docs/rest-api-reference-guide; community.miro.com/ideas/access-to-comments-via-rest-api-webhooks-6965; developers.miro.com/changelog/removed-experimental-webhooks-support
- Whimsical MCP / API: whimsical.com/learn/ai/mcp-tools; whimsical.com/releases/2026-3-mcp-for-coding-agents; whimsical.com/learn/integrations/api
- FigJam (creation is plugin-only, REST read-only): developers.figma.com/compare-apis/; developers.figma.com/docs/plugins/api/properties/figma-createconnector/
- tldraw (license): tldraw.dev/community/license; github.com/tldraw/tldraw/blob/main/LICENSE.md
- Excalidraw (MIT, JSON scene): docs.excalidraw.com/docs/codebase/json-schema; github.com/excalidraw/excalidraw/blob/master/LICENSE
- React Flow (MIT, controlled component, save/restore): reactflow.dev/api-reference/react-flow; reactflow.dev/examples/interaction/save-and-restore; xyflow.com/open-source
- draw.io (Apache, embed round-trip): drawio.com/doc/faq/embed-mode; github.com/jgraph/drawio/discussions/5612
- Mermaid (MIT, one-way render): github.com/mermaid-js/mermaid; mermaid.js.org/syntax/flowchart.html
