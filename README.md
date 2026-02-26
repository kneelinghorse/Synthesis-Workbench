# Synthesis Workbench

An LLM-driven design composition system that transforms website research into production design artifacts through a structured 5-phase workflow.

Synthesis Workbench sits at the center of a three-system architecture: **Stage1 Inspector** discovers a website's design patterns (colors, typography, components), the **Workbench** loads those discoveries and provides a chat-driven interface for composing designs, and **OODS Foundry** renders and validates the resulting design schemas.

## Architecture

```
Stage1 Inspector ──(bundles)──> Synthesis Workbench <──(MCP)──> OODS Foundry
   (port 3200)                     (port 3000)                   (port 4466)
   Scans websites                  Chat + composition            Renders schemas
   Token guesses                   Phase-gated tools             Validates schemas
   Component clusters              Live preview                  Builds tokens
```

**Data flow:**
1. Stage1 scans a website and produces artifacts: style fingerprints, token guesses, component clusters
2. Workbench loads these bundles and injects discovered patterns into the LLM's system prompt (ResearchContext)
3. You compose designs through natural language and slash commands — the LLM has access to document authoring tools
4. Foundry renders OODS component schemas to HTML and validates them
5. The preview pane shows live results with CSS variable injection
6. You export final designs as HTML, JSON, or YAML

## Prerequisites

- **Node.js 18+** and **npm**
- **pnpm** (for Stage1 and OODS Foundry sibling services)
- **Anthropic API key** (or local Ollama instance for offline use)

## Quick Start

```bash
cd "Synthesis Workbench"

# 1. Create your environment config
cp .env.example .env.local
# Edit .env.local — add your ANTHROPIC_API_KEY at minimum

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
# Open http://localhost:3000
```

The landing page shows three focus areas. Click **"Open Workbench"** or navigate to `/chat` to start the chat interface.

## Demo 1 Quick Start (Validated February 26, 2026)

Use this path to quickly verify that template application renders in preview.

1. Start all three services from this repo:
```bash
npm run dev:services
```
2. Open `http://localhost:3000/chat`.
3. In the composer, enter `/doc template dashboard` and click **Send**.
4. Confirm chat shows `Applying built-in template "dashboard".`
5. Confirm preview shows rendered content and the status chip reads `Live Render` when Foundry is available.
6. Open browser DevTools and confirm no console errors during the flow.

To verify static fallback mode:

1. Stop the dev server and run Workbench with Foundry unset:
```bash
OODS_FOUNDRY_MCP_URL="" npm run dev -- --hostname 127.0.0.1 --port 3000
```
2. Open `http://localhost:3000/chat`.
3. Run `/doc template dashboard` again.
4. Confirm preview still renders and status chip reads `Offline (Static)`.

## Service Setup

The Workbench can run standalone (chat + document authoring), but full functionality requires companion services.

### Workbench (this project)

```bash
cd "Synthesis Workbench"
npm install
npm run dev          # Development server on http://localhost:3000
```

### OODS Foundry MCP (required for /render, /validate)

The Foundry renders design schemas to HTML and validates component structures.

```bash
cd OODS-Foundry-mcp
pnpm install
pnpm --filter @oods/mcp-bridge run dev
# Bridge listens on http://127.0.0.1:4466 (POST /run)
```

Verify: The Workbench reads `OODS_FOUNDRY_MCP_URL` from `.env.local`
(recommended: `http://127.0.0.1:4466/run`).
If you configure the bare bridge root (`http://127.0.0.1:4466`), the client will
automatically target `/run`.

### Stage1 Inspector MCP (optional, for live bundle discovery)

Stage1 scans websites and produces research bundles. Without it, you can still load bundles from `stage1_out/` on disk.

```bash
cd Stage1
pnpm install
pnpm -C packages/stage1-mcp build
pnpm -C packages/mcp-bridge dev   # Serves on http://127.0.0.1:3200/mcp
```

Enable in `.env.local` by uncommenting:
```
NEXT_PUBLIC_STAGE1_MCP_URL="http://127.0.0.1:3200/mcp"
```

### Verification

Once services are running:
1. Open `http://localhost:3000` — landing page loads
2. Navigate to `/chat` — chat interface with preview pane appears
3. Type `/tool` — demo tool card should appear (verifies tool UI wiring)

## 5-Phase Workflow

The Workbench enforces a structured design workflow. Each phase unlocks specific tools — you cannot use tools outside their designated phase.

### Phase 1: Ingest

Load a Stage1 research bundle to discover components and token suggestions.

```
/bundle
```

The **BundlePicker** UI appears showing available Stage1 runs grouped by hostname. Select a run to load:
- **Component clusters** — discovered UI components with confidence scores
- **Token suggestions** — extracted colors, fonts, spacing mapped to token paths
- **Style fingerprint** — raw design pattern data

After loading, the LLM's system prompt is automatically enriched with the discovered patterns (via ResearchContext).

### Phase 2: Explore

Render and validate component schemas. Compose design documents.

```
/render {"component": "Button", "traits": {"intent": "primary"}}
/validate {"component": "Card", "props": {"title": "Hello"}}
/doc {"metadata": {"title": "My Dashboard"}, "root": {"nodeType": "layout", "layout": {"type": "stack", "gap": 16}, "children": []}}
```

- `/render` sends the schema to Foundry for HTML rendering (now validates before rendering by default)
- `/validate` checks schema structure without rendering
- `/doc` sets the active design document (see Document Model section below)

### Phase 3: Tune

Adjust design tokens and continue rendering. All Explore tools remain available.

```
/tokens colors.primary=#007bff spacing.md=2rem typography.fontFamily.sans="Roboto, sans-serif"
```

Token changes are applied immediately — the preview pane updates in real-time via CSS variable injection.

### Phase 4: Review

Request human approval before finalizing.

```
/review
```

The **ReviewGate** UI appears with approve/block buttons. Blocking records a reason and prevents advancing to the export phase.

### Phase 5: Done

Export the final design artifact.

```
/export html
/export json
/export yaml
```

Each format supports **Download** (browser file download) and **Copy to Clipboard**.

### Transitioning Phases

Move between phases at any time with:

```
/phase explore
/phase tune
/phase done
```

The transition validates prerequisites (e.g., review phase requires gate approval to advance).

## Slash Command Reference

| Command | Tool | Available Phases | Description |
|---------|------|-----------------|-------------|
| `/bundle` | load_bundle | ingest | Load a Stage1 research bundle |
| `/render` | render_component | explore, tune | Render component schema via Foundry (validates first) |
| `/validate` | validate_schema | explore, tune | Validate component schema via Foundry |
| `/doc` | set_document | explore, tune | Set or replace the active design document |
| `/tokens` | token_adjustment | tune | Adjust design tokens (key=value pairs) |
| `/review` | review_gate | review | Request human approval or block |
| `/export` | export_design | done | Export design as HTML, JSON, or YAML |
| `/phase` | phase_transition | all | Transition between workflow phases |
| `/signal` | signal_tool | all | Record a status signal (green/yellow/red) |
| `/tool` | demo_tool | all | Test tool UI wiring (development) |

**Phase gate errors:** If you try a command outside its allowed phase, you'll see an error like "Tool render_component is not available in the ingest phase. Transition to explore or tune first."

## Token System

Tokens are design variables (colors, typography, spacing, etc.) that flow through the entire system as CSS custom properties.

### Token Paths

Tokens use dot-notation paths that map to CSS variables:

| Path | CSS Variable | Default |
|------|-------------|---------|
| `colors.primary` | `--colors-primary` | `#3b82f6` |
| `colors.text.primary` | `--colors-text-primary` | `#0f172a` |
| `typography.fontFamily.sans` | `--typography-fontFamily-sans` | `Inter, system-ui, sans-serif` |
| `typography.fontSize.base` | `--typography-fontSize-base` | `1rem` |
| `spacing.md` | `--spacing-md` | `1rem` |
| `radius.md` | `--radius-md` | `0.375rem` |
| `shadow.md` | `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1)` |

### Available Token Categories

- **colors** — primary, secondary, accent, background, surface, text.{primary,secondary,disabled}, status.{success,warning,error,info}, border
- **typography** — fontFamily.{sans,mono}, fontSize.{xs,sm,base,lg,xl,2xl,3xl}, fontWeight.{normal,medium,semibold,bold}, lineHeight.{tight,normal,relaxed}
- **spacing** — xs, sm, md, lg, xl, 2xl
- **radius** — none, sm, md, lg, full
- **shadow** — sm, md, lg
- **custom** — arbitrary key-value pairs for extension

### Setting Tokens

Two formats supported:

```
# Key=value pairs (space-separated)
/tokens colors.primary=#ff0000 spacing.md=2rem

# JSON format
/tokens {"colors.primary": "#ff0000", "spacing.md": "2rem"}
```

### Auto-Seeding from Stage1

When you load a Stage1 bundle, extracted token suggestions are available for seeding. The BundlePicker UI shows a "Seed Tokens" action that maps discovered values to TokenState paths automatically.

## Design Document Model

Designs are composed as a recursive tree of nodes — layout containers and OODS components.

### DesignDocument Structure

```json
{
  "metadata": {
    "title": "My Dashboard",
    "description": "A metrics dashboard design"
  },
  "root": {
    "nodeType": "layout",
    "layout": { "type": "stack", "gap": 16 },
    "children": [
      {
        "nodeType": "component",
        "id": "nav-1",
        "ref": "oods:Navbar",
        "props": { "brand": "Acme", "links": ["Home", "About"] }
      },
      {
        "nodeType": "layout",
        "layout": { "type": "grid", "columns": 3, "gap": 16 },
        "children": [
          { "nodeType": "component", "id": "metric-1", "ref": "oods:MetricCard", "props": { "label": "Revenue", "value": "$12k" } },
          { "nodeType": "component", "id": "metric-2", "ref": "oods:MetricCard", "props": { "label": "Users", "value": "1,234" } },
          { "nodeType": "component", "id": "metric-3", "ref": "oods:MetricCard", "props": { "label": "Growth", "value": "+12%" } }
        ]
      }
    ]
  }
}
```

### Node Types

**ComponentNode** — References an OODS component rendered by Foundry:
```json
{ "nodeType": "component", "id": "unique-id", "ref": "oods:ComponentName", "props": { ... } }
```

**LayoutNode** — Arranges children in a stack (vertical) or grid:
```json
{ "nodeType": "layout", "layout": { "type": "stack", "gap": 16, "align": "center" }, "children": [...] }
{ "nodeType": "layout", "layout": { "type": "grid", "columns": 3, "gap": 16 }, "children": [...] }
```

### OODS Component Catalog

Reference these components using `oods:Name` format in ComponentNode.ref:

| Component | Props | Description |
|-----------|-------|-------------|
| `oods:Button` | text, intent, size | Interactive button |
| `oods:Card` | title, content, image | Content card container |
| `oods:Header` | title, subtitle, level | Page/section header |
| `oods:Footer` | content, links | Page footer |
| `oods:Input` | label, placeholder, type | Text input field |
| `oods:Navbar` | brand, links | Navigation bar |
| `oods:Sidebar` | items, collapsed | Side navigation panel |
| `oods:MetricCard` | label, value, trend | Data metric display |
| `oods:Avatar` | src, name, size | User avatar |
| `oods:Badge` | text, variant | Status badge |
| `oods:Alert` | message, severity | Alert/notification |
| `oods:Table` | columns, rows | Data table |
| `oods:Tabs` | tabs, activeTab | Tabbed content |
| `oods:Modal` | title, content, open | Dialog overlay |
| `oods:Tooltip` | content, trigger | Hover tooltip |

### Editing Documents

Use `/doc` to set a complete document, or `/patch` (via the LLM) to modify individual nodes by ID.

## Export Formats

### HTML

Standalone HTML document with all CSS variables inlined in a `<style>` block. Opens directly in any browser.

```html
<!DOCTYPE html>
<html>
  <head>
    <style>
      :root {
        --colors-primary: #3b82f6;
        --typography-fontFamily-sans: Inter, system-ui, sans-serif;
        /* ... all tokens ... */
      }
    </style>
  </head>
  <body>
    <!-- Rendered component HTML -->
  </body>
</html>
```

### JSON

Structured export containing the design document, token state, data context, and timestamp:

```json
{
  "document": { "metadata": {...}, "root": {...} },
  "tokenState": { "colors": {...}, "typography": {...}, ... },
  "dataContext": {},
  "exportedAt": "2026-02-07T01:00:00.000Z"
}
```

### YAML

Human-readable design document format used for persistence. Files are stored in `designs/{slug}.design.yaml`.

## Testing

```bash
npm run test              # Run all tests (vitest)
npx vitest --watch        # Watch mode
npx vitest run src/       # Run only unit tests
npx vitest run test/      # Run only integration tests
```

### Test Structure

```
src/**/*.test.ts           # Unit tests (colocated with source)
test/integration/          # Integration test suites
test/fixtures/             # Test data (bundles, documents, OODS mocks)
```

### Key Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `test/integration/pipeline.test.ts` | 4 | Full pipeline: bundle → tokens → document → render → export |
| `test/integration/phase-gating.test.ts` | 55 | All phase × tool combinations |
| `test/integration/real-data-walkthrough.test.ts` | 10 | Capstone validation with real Stage1 artifacts |
| `test/integration/error-paths.test.ts` | 15 | Error handling and rejection scenarios |
| `test/integration/export.test.ts` | 10 | HTML, JSON, YAML export validation |
| `src/lib/mcp/retry.test.ts` | 16 | Retry with exponential backoff |
| `src/lib/runtime/adapters/withToolCommands.test.ts` | 39 | Slash command routing and phase gates |

### Test Fixtures

Three bundle fixtures (`test/fixtures/stage1-bundle.ts`):
- `DASHBOARD_BUNDLE` — Realistic bundle with tokens, components, artifacts
- `MINIMAL_BUNDLE` — Edge case: manifest only
- `FINGERPRINT_ONLY_BUNDLE` — Fallback extraction from style fingerprint

Three OODS mock clients (`test/fixtures/oods-responses.ts`):
- `createSuccessClient()` — Renders based on component name
- `createStrictValidateClient()` — Validates component field requirement
- `createPartialFailureClient()` — Simulates render failures

## Troubleshooting

### "Foundry MCP base URL is not configured"

The OODS Foundry URL is not set. Add to `.env.local`:
```
OODS_FOUNDRY_MCP_URL="http://127.0.0.1:4466/run"
```

### MCP connection timeout / NETWORK_ERROR

The target MCP server is not running. Start the service:
- **Foundry bridge:** `cd OODS-Foundry-mcp && pnpm --filter @oods/mcp-bridge run dev` (bridge root on port 4466, tool endpoint `/run`)
- **Stage1 bridge:** `cd Stage1 && pnpm -C packages/stage1-mcp build && pnpm -C packages/mcp-bridge dev` (endpoint `/mcp` on port 3200)

If Foundry bridge starts on an ephemeral port (because `4466` is busy), set
`OODS_FOUNDRY_MCP_URL` to `http://127.0.0.1:<actualPort>/run`.

The retry system will attempt 3 times with exponential backoff (500ms, 1s, 2s) before failing.

### "Tool X is not available in Y phase"

Phase gating prevents using tools outside their designated phase. Use `/phase <target>` to transition:
```
/phase explore    # Unlocks /render, /validate, /doc
/phase tune       # Unlocks /tokens (plus all explore tools)
/phase review     # Unlocks /review
/phase done       # Unlocks /export
```

### Stage1 bundles not showing in BundlePicker

If `NEXT_PUBLIC_STAGE1_MCP_URL` is not configured, the Workbench loads bundles from the `stage1_out/` directory on disk. Ensure Stage1 runs exist at `stage1_out/stage1/{hostname}/{run-id}/`.

### "useResearchContext must be used within a ResearchProvider"

This is a React component tree error. The `ResearchProvider` must wrap any component that calls `useResearchContext()`. This is configured in `RuntimeProvider.tsx` — if you see this error, check that the chat page is rendering inside the provider tree.

## Project Structure

```
src/
  app/                          # Next.js pages and API routes
    chat/page.tsx               # Chat interface (main workbench)
    api/anthropic/route.ts      # Anthropic API proxy
    api/designs/route.ts        # Design persistence API
  components/
    assistant-ui/               # Chat thread, composer, messages
    tool-ui/                    # Tool UI components (one per tool)
      ToolUIRegistry.tsx        # Central tool registration
      ToolOutputCard.tsx        # Shared card component system
      ToolErrorBoundary.tsx     # Error boundary wrapper
    workbench/                  # Layout, preview, bundle picker
      WorkbenchLayout.tsx       # Main 2-pane layout
      PreviewPane.tsx           # iframe preview with postMessage bridge
      BundlePicker.tsx          # Stage1 run selector with filtering
  lib/
    engine/                     # Composition renderer, layout engine, data binding
    export/                     # HTML/JSON/YAML export + download utilities
    mcp/                        # MCP clients (Stage1 + Foundry) + retry logic
    preview/                    # iframe message protocol + inject script
    runtime/
      adapters/                 # LLM adapters (Anthropic, Ollama) + withToolCommands
      tools/                    # Tool contracts + phase-tool map
      ResearchContext.tsx        # Stage1 data → LLM system prompt injection
    stores/                     # Zustand state (phase, tokens, document, preview, bundle)
    stage1/                     # Bundle loader (artifact ingestion)
    persistence/                # YAML design file I/O
  types/                        # TypeScript interfaces (TokenState, DesignDocument, Phase)
test/
  integration/                  # Integration test suites
  fixtures/                     # Test data (bundles, documents, mocks)
designs/                        # Design document files (.design.yaml)
cmos/                           # CMOS project database + foundational docs
```
