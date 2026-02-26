# Synthesis Workbench Roadmap

## Guiding Principles
- **Web-first**: No Electron shell; browser-based Next.js app.
- **Standalone tools**: Stage1 Inspector and OODS Foundry are independent services.
- **Stable contracts**: Integrate via Stage1 bundle files and Foundry MCP tools.

## Phase 1: Foundation & Core Chat (Sprint 01)
**Goal**: Establish the application shell and basic chat capability with local LLM.
- [ ] Initialize Next.js 15 project with Tailwind CSS & Shadcn/UI.
- [ ] Implement `LocalRuntime` with `assistant-ui`.
- [ ] Create `OllamaAdapter` for local model inference (Llama 3).
- [ ] Create `AnthropicAdapter` for fallback cloud inference.
- [ ] Verify basic chat loop (User -> LLM -> Response).

**Definition of Done**:
- App shell boots and renders a basic chat page.
- LocalRuntime runs with at least one adapter.
- Both adapters are wired and selectable/fallback-capable.

## Phase 2: Tool UI Infrastructure (Sprint 02)
**Goal**: Enable the LLM to render interactive UI components in the chat.
- [ ] Implement `makeAssistantToolUI` pattern.
- [ ] Create `PhaseTransitionTool` for workflow management.
- [ ] Create `ReviewGateTool` for Human-in-the-Loop (HITL) approvals.
- [ ] Design and implement base "Card" components for tool outputs.

**Definition of Done**:
- Tool UI renders inside chat and updates state reliably.
- Review gates can block/allow transitions.
- Tool output cards have a reusable base style.

## Phase 3: State & Live Preview (Sprint 03)
**Goal**: Connect chat decisions to a live visual preview.
- [ ] Implement `TokenState` and `PhaseState` Zustand stores.
- [ ] Build `PreviewPane` component (iframe + `srcdoc`).
- [ ] Implement `postMessage` synchronization bridge.
- [ ] Create `TokenAdjustmentTool` to modify state via chat.
- [ ] Load Stage1 bundle manifest and seed TokenState from `token-guess.json`.

**Definition of Done**:
- Token changes update the preview deterministically.
- PostMessage bridge syncs state without manual refresh.
- Stage1 bundle ingestion seeds initial tokens.

## Phase 4: OODS Deep Integration (Sprint 04)
**Goal**: Integrate with OODS Foundry via MCP.
- [ ] Set up MCP Client in the Workbench.
- [ ] Connect to local OODS Foundry MCP Server.
- [ ] Implement `RenderComponentTool` proxy (LLM -> Workbench -> MCP -> Preview).
- [ ] Validate end-to-end flow: Chat -> Token Change -> MCP Build -> Preview Update.

**Definition of Done**:
- Foundry MCP tools render/validate/build on demand.
- Preview reflects Foundry output for the active phase.
- Export artifacts exist (`output/ui-schema.json`, `output/tokens.json`, `output/validation-report.json`).

## Future Considerations
- **Multi-Agent Orchestration**: Specialized agents for Layout vs. Color.
- **Voice Interface**: Audio input/output for design reviews.
- **Export/Sync**: Commit generated tokens back to OODS codebase.
