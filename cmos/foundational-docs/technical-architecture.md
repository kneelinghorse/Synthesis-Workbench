# Technical Architecture: Synthesis Workbench

## 1. Executive Summary
Synthesis Workbench is a **web-first** design orchestration tool enabling "Agent-Forward Design." It integrates a chat interface (Assistant-UI) with a live preview environment (OODS Foundry) and ingests Stage1 research bundles so users and AI agents can collaborate on design system tokens and component composition. The Workbench is the central integrator; Stage1 Inspector and OODS Foundry remain **standalone services** connected by stable contracts.

## 2. Core Architecture

### 2.1 Runtime Layer
- **Framework**: Next.js 15 (App Router)
- **State Management**: Zustand (local client state)
- **Chat Runtime**: `LocalRuntime` from `@assistant-ui/react`
    - **Backends**: 
        - Primary: Ollama (Local) for privacy and zero-cost iteration.
        - Fallback: Anthropic API for complex reasoning/codgen.
    - **Adapter Pattern**: Custom `ChatModelAdapter` to abstract provider differences.

### 2.2 UI Layer
- **Component System**: Shadcn/UI + Tailwind CSS v4.
- **Chat Interface**: Assistant-UI primitives (`Thread`, `Composer`, `MessageList`).
- **Tool UI**: Custom React components rendered via `makeAssistantToolUI`.
    - Allows the LLM to render interactive controls (phase transitions, token sliders, reviews) directly in the chat stream.

### 2.3 Preview & Live Editing
- **Mechanism**: `iframe` with `srcdoc` injection.
- **Synchronization**: `postMessage` bridge between Workbench (Parent) and Preview (Child).
- **Updates**:
    - **TokenState**: CSS variables injected dynamically.
    - **Render Contract (Sprint-13 update)**:
        - `useCompositionPreview` consumes a single `PreviewRenderer` abstraction with three adapters:
          - `full-document` (rollback-safe path)
          - `fragments` (active fragment adapter)
          - `composition` (deprecated compatibility alias that now routes to fragment adapter)
        - Feature flag: `NEXT_PUBLIC_PREVIEW_RENDERER_MODE` / `PREVIEW_RENDERER_MODE`.
        - Fragment adapter flow:
          - Pre-validates schema with `repl.validate` before requesting fragments.
          - Sends one Foundry render call with `output.format="fragments"` (`strict=false`, `includeCss=true`).
          - Composes returned per-node fragments into Workbench layout HTML and injects scoped Foundry CSS refs.
          - Falls back to full-document adapter when fragment contract checks fail.
        - Static renderer fallback is used only when Foundry is unavailable (missing client/base URL, network/connectivity, timeout).

### 2.4 Integration Layer (Contracts)
- **Stage1 Intake (file-based)**:
    - Workbench loads `design-research/stage1/manifest.json` and referenced artifacts.
    - Unknown artifact types are treated as display-only unless required for a gate.
- **Stage1 Invocation (optional)**:
    - MVP: CLI invocation for Stage1 runs.
    - Preferred: WebSocket bridge for progress events and file change notifications.
- **Foundry MCP Proxy**:
    - The LLM calls a "Workbench Tool" (e.g., `render_component`).
    - The Workbench proxies to the **OODS Foundry MCP Server** via `@modelcontextprotocol/sdk`.
    - Required tool surface (minimum): `repl.render`, `repl.validate`, `tokens.build`, `a11y.scan`.
    - Results are returned to the LLM and/or rendered in the Tool UI.

## 3. Data Model

### 3.1 TokenState
Represents the active design decisions.
```typescript
interface TokenState {
  [tokenName: string]: string; // e.g., "color-primary": "hsl(220 90% 50%)"
}
```

### 3.2 PhaseState
Tracks the current stage of the design workflow.
```typescript
type DesignPhase = "ingest" | "explore" | "tune" | "review" | "done";
type WorkflowMode = "strict" | "flexible";

interface PhaseState {
  currentPhase: DesignPhase;
  workflowMode: WorkflowMode;
}
```

- **Strict mode**: Preserves explicit tool gating by phase.
- **Flexible mode**: Keeps the phase timeline but relaxes tool gating to support rapid iteration loops.

### 3.3 Stage1 Bundle
Contains the research context, evidence, and synthesis seeds detected from the target application (via Stage1 Inspector).

**Minimum required**:
- `design-research/stage1/manifest.json`
- `design-research/stage1/synthesis/token-guess.json`
- At least one evidence artifact (e.g., screenshot + computed-style summary)

**Manifest requirements**:
- `contractVersion`, `bundleVersion`, `toolVersion`, `generatedAt`
- `targets[]`, `jobs[]`, typed `artifacts[]`

### 3.4 Workspace Contract (Cross-Tool)
Canonical layout for a design project workspace:
```
/.theia/                     # Workbench state + settings (or equivalent)
/design-research/            # Stage1 outputs + research inputs
/briefs/                     # Design brief artifacts
/plans/                      # Design plan artifacts
/phases/                     # Phase outputs and snapshots
/output/                     # Final exports (ui-schema/tokens/validation)
/.mcp-config.json            # Foundry MCP config (if needed)
```

## 4. Key Decisions
1.  **LocalRuntime**: Chosen over `ExternalStoreRuntime` for simplicity and built-in state management.
2.  **Iframe Preview**: Chosen over WebContainers/Sandpack for lower complexity, instant startup, and sufficient isolation for HTML/CSS previewing.
3.  **MCP Proxy**: Decouples the frontend from direct MCP server management, allowing the workbench to mediate tool access.
4.  **Web-First**: Electron is out of scope; the Workbench is a browser-based Next.js app.
5.  **Standalone Tools**: Stage1 Inspector and Foundry are independent services connected by stable contracts.

## 5. Security & Performance
- **Isolation**: Preview runs in a sandboxed iframe.
- **Local-First**: Defaulting to Ollama keeps sensitive design data local.
- **Optimization**: React Server Components (RSC) for initial shell; Client Components for interactive chat and state.

## 6. Runtime Configuration
- **Ollama**: Base URL + model name via env vars.
- **Anthropic**: API key via env vars.
- **Foundry MCP**: Server connection config (local or remote).
- **Stage1**: CLI or WebSocket bridge config for run + progress events.

## 7. Development Startup

### All-in-one
```bash
pnpm dev:services
```
Starts Next.js (:3000), Foundry bridge (:4466), and Stage1 bridge (:3200) in parallel with colored log prefixes. Press Ctrl+C to stop all.

### Manual startup (each in a separate terminal)
```bash
# 1. Next.js dev server
pnpm dev                                              # → http://localhost:3000

# 2. Foundry MCP bridge
cd ../OODS-Foundry-mcp/packages/mcp-bridge && pnpm dev  # → http://127.0.0.1:4466

# 3. Stage1 MCP bridge
cd ../Stage1/packages/mcp-bridge && pnpm dev             # → http://127.0.0.1:3200
```

### Health verification
- **Foundry**: `curl -s -X POST http://127.0.0.1:4466/run -H "Content-Type: application/json" -d '{"tool":"repl.validate","input":{"mode":"full","schema":{"version":"2025.11","screens":[{"id":"test","component":"Button","props":{"label":"Test"}}]}}}'` — should return `{"ok":true,...}`
- **Stage1**: `curl http://127.0.0.1:3200/health` — should return 200
- **Preview panel**: FoundryStatusChip shows "Live Render" (green) when bridge is connected

### Environment variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `OODS_FOUNDRY_MCP_URL` | `http://127.0.0.1:4466/run` | Foundry bridge endpoint |
| `NEXT_PUBLIC_USE_TEST_ADAPTER` | — | Force test adapter (skip LLM) |
| `ANTHROPIC_API_KEY` | — | Anthropic API key for Claude |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | — | Ollama local LLM config |

### Troubleshooting
- **Foundry bridge not responding**: Kill any stale process on :4466, then restart with `pnpm dev` from the bridge directory. Schema is not hot-reloaded; restart required after registry changes.
- **Grid component not in Foundry registry**: Grid layouts are bridge-mapped to Stack with `layoutType: "grid"` props. This is handled automatically.
- **Preview shows "Offline (Static)"**: Foundry bridge is not reachable. Check that :4466 is running and `OODS_FOUNDRY_MCP_URL` is set correctly.

## 8. References
- TraceLab: Tool Interface Contract (`1305bad8-6820-41d2-8795-e08d07e1db07`)
- TraceLab: Governing Architecture (`39da94b0-cc86-40c6-ada1-d33837645d8f`)
