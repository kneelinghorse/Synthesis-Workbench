# E2E Verification Runbook

Manual verification procedure for the full Synthesis Workbench pipeline with live services. Follow each step sequentially — each builds on the previous.

## Prerequisites Checklist

Before starting, ensure:

- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm and pnpm installed (`npm --version`, `pnpm --version`)
- [ ] `.env.local` exists in `Synthesis Workbench/` with:
  - `ANTHROPIC_API_KEY` set to a valid key
  - `OODS_FOUNDRY_MCP_URL="http://127.0.0.1:4466/run"`
  - `NEXT_PUBLIC_STAGE1_MCP_URL="http://127.0.0.1:3200/mcp"` (uncommented)
- [ ] Dependencies installed in all three projects:
  - `cd "Synthesis Workbench" && npm install`
  - `cd OODS-Foundry-mcp && pnpm install && pnpm --filter @oods/mcp-server run build`
  - `cd Stage1 && pnpm install && pnpm -C packages/stage1-mcp build`

---

## Step 1: Start Services

Open three terminal windows/tabs:

### Terminal 1 — OODS Foundry MCP

```bash
cd OODS-Foundry-mcp
pnpm --filter @oods/mcp-bridge run dev
# Expected: bridge listening on 127.0.0.1:4466 (POST /run)
```

**Verify:** Server outputs a startup message. No errors in console.

### Terminal 2 — Stage1 Inspector MCP

```bash
cd Stage1
pnpm -C packages/mcp-bridge dev
# Expected: bridge listening on 127.0.0.1:3200 (POST /mcp)
```

**Verify:** Server outputs a startup message. No errors in console.

### Terminal 3 — Synthesis Workbench

```bash
cd "Synthesis Workbench"
npm run dev
# Expected: Next.js dev server on http://localhost:3000
```

**Verify:** Open `http://localhost:3000` in browser. Landing page loads with three focus areas (Stage1 Intake, Phase Orchestration, Foundry Calls).

---

## Step 2: Service Health Check

### 2a. Workbench UI

1. Navigate to `http://localhost:3000`
2. **Expected:** Landing page with "Open Workbench" link
3. Click "Open Workbench" or go to `http://localhost:3000/chat`
4. **Expected:** Two-pane layout — chat panel on left, preview pane on right

### 2b. Tool UI Wiring

1. In the chat input, type: `/tool`
2. Press Enter
3. **Expected:** A DemoTool card appears in the chat thread with a "Run Demo" button
4. Click the button
5. **Expected:** Card updates to show "completed" status

### 2c. Phase System

1. Type: `/phase explore`
2. **Expected:** PhaseTransition card appears showing current phase (ingest) and target (explore)
3. Click confirm/transition button
4. **Expected:** Phase transitions to "explore"

---

## Step 3: Bundle Ingestion (Ingest Phase)

First, reset to ingest phase:
```
/phase ingest
```

### 3a. Load Stage1 Bundle

1. Type: `/bundle`
2. **Expected:** BundlePicker UI appears
3. **Expected scenarios:**
   - **If Stage1 MCP is running:** Shows runs from the Stage1 server, grouped by hostname
   - **If using file-system bundles:** Shows runs from `stage1_out/stage1/` directory
4. Select the `example.com` run (or any available run)
5. **Expected:** Bundle loads successfully. Card shows:
   - Component count (e.g., "5 components discovered")
   - Token suggestion count (e.g., "24 token suggestions")
   - Artifact list (style_fingerprint, token_guess, component_clusters)

### 3b. Verify ResearchContext Injection

1. Open browser DevTools → Network tab
2. Type a message like "What components did you discover?"
3. Watch the POST request to `/api/anthropic`
4. **Expected:** The request body's `system` field contains:
   - "DOCUMENT AUTHORING TOOLS" section (always present)
   - "DESIGN DISCOVERY CONTEXT (STAGE1)" section (present after bundle load)
   - Listed component names and token suggestions from the loaded bundle

### 3c. Seed Tokens (if BundlePicker offers the option)

1. If the BundlePicker shows a "Seed Tokens" action, click it
2. **Expected:** Token store updated with suggestions from the bundle
3. **Verify:** Preview pane's iframe should reflect new CSS variable values

---

## Step 4: Design Composition (Explore Phase)

Transition to explore:
```
/phase explore
```

### 4a. Validate a Component Schema

```
/validate {"component": "Button", "traits": {"intent": "primary"}, "content": {"text": "Click Me"}}
```

**Expected:** ValidateSchema card appears.
- **If Foundry is running:** Shows validation result (valid: true/false, any errors/warnings)
- **If Foundry is NOT running:** Shows connection error with advice ("Check that OODS Foundry is running on http://127.0.0.1:4466/run")

### 4b. Render a Component

```
/render {"component": "Button", "traits": {"intent": "primary"}, "content": {"text": "Click Me"}}
```

**Expected:**
1. RenderComponent card appears
2. Pre-render validation runs first (validate: true is the default)
3. If validation passes, Foundry renders the component
4. **Preview pane** updates to show the rendered Button HTML in the iframe
5. Card shows rendered HTML snippet and any warnings

### 4c. Set a Design Document

```
/doc {"metadata": {"title": "Test Dashboard"}, "root": {"nodeType": "layout", "layout": {"type": "stack", "gap": 16}, "children": [{"nodeType": "component", "id": "btn-1", "ref": "oods:Button", "props": {"text": "Primary", "intent": "primary"}}, {"nodeType": "component", "id": "btn-2", "ref": "oods:Button", "props": {"text": "Secondary", "intent": "secondary"}}]}}
```

**Expected:**
1. SetDocument card appears showing document structure
2. Composition engine renders all components via Foundry (two Button renders)
3. Preview pane updates to show stacked buttons layout

---

## Step 5: Token Adjustment (Tune Phase)

```
/phase tune
```

### 5a. Adjust Tokens

```
/tokens colors.primary=#ff0000 colors.secondary=#00ff00
```

**Expected:**
1. TokenAdjustment card appears showing changes table:
   - `colors.primary`: `#3b82f6` → `#ff0000`
   - `colors.secondary`: `#64748b` → `#00ff00`
2. Click "Apply" to confirm
3. **Preview pane updates in real-time** — buttons should reflect new colors
4. Inspect the iframe: `:root` CSS variables should show updated values

### 5b. Verify Live Preview Update

1. Open browser DevTools
2. Select the preview iframe
3. Inspect `<html>` element styles
4. **Expected:** CSS variables include `--colors-primary: #ff0000` and `--colors-secondary: #00ff00`

---

## Step 6: Review Gate (Review Phase)

```
/phase review
```

### 6a. Approve Design

```
/review
```

**Expected:**
1. ReviewGate card appears with Approve/Block buttons
2. Click **Approve**
3. Card updates to show "approved" status
4. Phase gate is now cleared for advancing to "done"

---

## Step 7: Export (Done Phase)

```
/phase done
```

### 7a. Export HTML

```
/export html
```

**Expected:**
1. ExportDesign card appears with download options
2. Click **Download**
3. Browser downloads a `.html` file
4. **Open the file in browser:** Should render the design with all CSS variables inlined

### 7b. Export JSON

```
/export json
```

**Expected:**
1. ExportDesign card appears
2. Click **Download**
3. File contains: `document`, `tokenState` (with modified colors), `dataContext`, `exportedAt` timestamp

### 7c. Export YAML

```
/export yaml
```

**Expected:**
1. ExportDesign card appears
2. Click **Download** or **Copy to Clipboard**
3. File contains YAML representation of the design document

---

## Verification Summary

| Checkpoint | What to Verify | Pass Criteria |
|------------|---------------|---------------|
| Service startup | All 3 services start without errors | Landing page loads at localhost:3000 |
| Tool UI wiring | `/tool` renders DemoTool card | Card appears and completes |
| Phase transitions | `/phase explore` works | Phase updates, tools gate correctly |
| Bundle ingestion | `/bundle` loads Stage1 data | Components and tokens extracted |
| ResearchContext | LLM system prompt has Stage1 data | Network tab shows discovery context |
| Schema validation | `/validate` calls Foundry | Returns valid/invalid result |
| Component render | `/render` shows HTML in preview | Preview pane displays rendered component |
| Document composition | `/doc` sets multi-component layout | Preview shows full layout |
| Token adjustment | `/tokens` updates CSS variables | Preview reflects color/font changes in real-time |
| Review gate | `/review` records approval | Gate status set to "approved" |
| HTML export | `/export html` produces file | Standalone HTML opens in browser correctly |
| JSON export | `/export json` has all fields | Contains document + tokenState + timestamp |
| YAML export | `/export yaml` produces file | Valid YAML design document |

---

## Known Gaps and Workarounds

### Stage1 MCP Not Running

**Symptom:** BundlePicker shows no runs or connection error.
**Workaround:** The Workbench can load bundles from `stage1_out/` on disk. Place Stage1 run directories at `stage1_out/stage1/{hostname}/{run-id}/` with `manifest.json` and `artifacts/` subdirectory.

### OODS Foundry Not Running

**Symptom:** `/render` and `/validate` fail with connection timeout.
**Impact:** Cannot render or validate component schemas. Document composition (which calls Foundry for each component) will fail.
**Workaround:** None for rendering — Foundry must be running. The rest of the workflow (bundle loading, token adjustment, export structure) works without Foundry, but exported HTML will not contain rendered component output.

### Stage1 MCP URL Commented Out

**Symptom:** BundlePicker doesn't connect to Stage1 server.
**Fix:** Uncomment `NEXT_PUBLIC_STAGE1_MCP_URL` in `.env.local` and restart the dev server.

### Retry Behavior

MCP calls (Stage1 and Foundry) use automatic retry with exponential backoff:
- **Attempt 1:** Immediate
- **Attempt 2:** After 500ms
- **Attempt 3:** After 1000ms
- **Retryable errors:** TIMEOUT, NETWORK_ERROR, CONNECTION_FAILED
- **Non-retryable:** MISSING_BASE_URL, TOOL_ERROR, NOT_FOUND

If a service comes back within the retry window, the operation succeeds transparently.

### Preview Pane Not Updating

**Symptom:** Token changes or renders don't appear in preview.
**Debug:** Check browser console for PostMessage errors. The preview iframe uses `sandbox="allow-scripts"` and communicates via `window.postMessage()`. Ensure no content security policy is blocking the iframe.

### Empty Component Catalog

**Symptom:** LLM doesn't know about available OODS components.
**Cause:** ResearchContext always includes the DOCUMENT_AUTHORING_PROMPT with the full component catalog (15 components). If the LLM isn't using them, check that the Anthropic API proxy is receiving the system prompt correctly (DevTools → Network tab → check `system` field in request body).

---

## Cross-References

- **Environment setup:** See `README.md` → Quick Start and Service Setup
- **Troubleshooting:** See `README.md` → Troubleshooting section
- **E2E Testing Plan:** See `e2e_testing_plan.md` at project root for automated testing roadmap
- **Architecture:** See `cmos/foundational-docs/technical-architecture.md`
- **Stage1 Contract Spec:** See `cmos/foundational-docs/stage1-contract-enhancement-spec.md`
