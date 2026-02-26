# Assistant-UI Integration Specification for Synthesis Workbench

## Document Metadata
- **Version:** 1.1.0
- **Date:** 2026-01-01
- **Status:** Draft
- **Author:** Research synthesis from TraceLab missions + assistant-ui documentation deep dive + Gemini 3 Deep Research

---

## Executive Summary

This specification defines how Synthesis Workbench will integrate **assistant-ui** as its chat interface layer. The research confirms assistant-ui is the optimal choice for our requirements:

1. **Backend-agnostic architecture** — LocalRuntime allows any LLM backend (Ollama, Anthropic, custom)
2. **Composable primitives** — Radix-style headless components match our design system approach
3. **Tool UI rendering** — `makeAssistantToolUI` provides exactly what we need for phase controls and OODS operations
4. **MIT licensed** — No commercial restrictions

### Research Foundation

This specification synthesizes findings from:
- **TraceLab Missions:** WORKBENCH-ARCH-01 (Chat + Canvas Survey), WORKBENCH-ARCH-02 (AI Chat Libraries), WORKBENCH-ARCH-03 (Preview Technologies)
- **Gemini 3 Deep Research:** 3 comprehensive reports totaling 13,742 words analyzing chat libraries, preview architectures, and sandbox technologies
- **Assistant-UI Documentation:** Direct source examination of runtime patterns, Ollama integration, and tool UI APIs

---

## Part 1: Architecture Overview

### 1.1 Runtime Selection: LocalRuntime

Assistant-ui provides two core runtimes:

| Runtime | State Management | Best For |
|---------|-----------------|----------|
| **LocalRuntime** | Built-in | Quick setup, standard apps, **our use case** |
| **ExternalStoreRuntime** | You control | Complex state requirements, Redux integration |

**Decision: Use LocalRuntime**

Rationale:
- Manages chat state internally (messages, threads, conversation history)
- Simple adapter pattern for any backend
- Built-in features: branch switching, message editing, regeneration
- Extensible via adapters (attachments, history, feedback)

### 1.2 Core Integration Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│  SYNTHESIS WORKBENCH                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ AssistantRuntime │◄───│ LocalRuntime    │                    │
│  │ Provider        │    │ (useLocalRuntime)│                    │
│  └────────┬────────┘    └────────┬────────┘                    │
│           │                      │                              │
│           │              ┌───────▼────────┐                    │
│           │              │ ChatModelAdapter│◄── Our custom     │
│           │              └───────┬────────┘    adapter         │
│           │                      │                              │
│           │              ┌───────▼────────┐                    │
│           │              │ LLM Backend    │                    │
│           │              │ (Ollama/       │                    │
│           │              │  Anthropic/    │                    │
│           │              │  Custom)       │                    │
│           │              └────────────────┘                    │
│           │                                                     │
│           ▼                                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    UI Components                        │    │
│  ├────────────────────────────────────────────────────────┤    │
│  │  Thread  │  Composer  │  MessageList  │  ActionBar     │    │
│  │  (chat)  │  (input)   │  (messages)   │  (actions)     │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Validated Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15 (App Router) | SSR, API routes, React 19 support |
| State | Zustand | Matches assistant-ui internals, simple API |
| Chat | Assistant UI (@assistant-ui/react) | Backend-agnostic, tool UI rendering, MIT |
| Preview | Simple iframe (srcdoc) | Zero licensing, instant latency, validated by research |
| Styling | Tailwind + shadcn/ui | Matches assistant-ui defaults |
| LLM | Anthropic API OR Ollama | Runtime adapter allows hot-switching |

**Why NOT alternatives:**
- **WebContainers:** $27k/yr enterprise, COOP/COEP complexity, overkill for our use case
- **Sandpack Nodebox:** License trap for commercial use (NOT Apache 2.0 for Node templates)
- **CopilotKit:** Good CoAgent state sync, but we have our own state model (TokenState)
- **E2B:** Wrong use case (we're not executing untrusted code)

---

## Part 2: Local LLM Support (Ollama)

### 2.1 Official Ollama Integration

Assistant-ui explicitly supports Ollama via the Vercel AI SDK provider:

```bash
npm install ai @assistant-ui/react-ai-sdk ollama-ai-provider-v2
```

**API Route (Next.js):**
```typescript
// app/api/chat/route.ts
import { ollama } from "ollama-ai-provider-v2";
import { convertToModelMessages, streamText } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: ollama("llama3"),  // or any Ollama model
    messages: convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
```

**No environment variables needed** — Ollama runs locally on `http://localhost:11434`

### 2.2 Custom LocalRuntime Adapter (Direct Ollama)

For more control, we can bypass the AI SDK and connect directly to Ollama:

```typescript
// lib/runtime/adapters/ollama.ts
import type { ChatModelAdapter } from "@assistant-ui/react";

const OllamaAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",  // configurable
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
            .filter(c => c.type === "text")
            .map(c => c.text)
            .join("\n"),
        })),
        stream: true,
      }),
      signal: abortSignal,
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let text = "";

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter(Boolean);
      
      for (const line of lines) {
        const json = JSON.parse(line);
        if (json.message?.content) {
          text += json.message.content;
          yield {
            content: [{ type: "text", text }],
          };
        }
      }
    }
  },
};
```

### 2.3 Multi-Provider Support

For Synthesis Workbench, we want to support multiple backends:

```typescript
// lib/runtime/adapters/index.ts
type LLMProvider = "ollama" | "anthropic" | "openai" | "custom";

interface ProviderConfig {
  provider: LLMProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

const createAdapter = (config: ProviderConfig): ChatModelAdapter => {
  switch (config.provider) {
    case "ollama":
      return OllamaAdapter;
    case "anthropic":
      return AnthropicAdapter;
    case "openai":
      return OpenAIAdapter;
    case "custom":
      return CustomAdapter(config.baseUrl);
  }
};

// Environment-based switching
const getDefaultAdapter = (): ChatModelAdapter => {
  const useLocal = process.env.USE_LOCAL_LLM === "true";
  return useLocal 
    ? createAdapter({ provider: "ollama", model: "llama3" })
    : createAdapter({ provider: "anthropic", model: "claude-3-5-sonnet-20240620" });
};
```

### 2.4 Ollama Model Recommendations

For Synthesis Workbench tasks:

| Task | Recommended Model | Context | Notes |
|------|------------------|---------|-------|
| Design reasoning | llama3.1:70b | 128k | Best reasoning |
| Fast iteration | llama3.1:8b | 128k | Quick responses |
| Code generation | codellama:34b | 16k | Code-focused |
| Function calling | mistral:7b-instruct | 32k | Good tool use |

---

## Part 3: Tool UI for OODS Operations

### 3.1 makeAssistantToolUI Pattern

This is the killer feature for our use case. Assistant-ui provides `makeAssistantToolUI` for rendering tool calls as React components:

```typescript
import { makeAssistantToolUI } from "@assistant-ui/react";

// Tool UI for token adjustment operations
const TokenAdjustmentToolUI = makeAssistantToolUI({
  toolName: "adjust_token",
  render: ({ args, result, status }) => {
    if (status.type === "running") {
      return <TokenAdjustmentSkeleton token={args.tokenName} />;
    }
    
    if (result) {
      return (
        <TokenAdjustmentCard
          token={args.tokenName}
          oldValue={args.oldValue}
          newValue={result.newValue}
          preview={result.previewUrl}
        />
      );
    }
    
    return null;
  },
});
```

### 3.2 Synthesis Workbench Tool UIs

We need tool UIs for:

```typescript
// 1. Phase Transition Tool
const PhaseTransitionToolUI = makeAssistantToolUI({
  toolName: "transition_phase",
  render: ({ args, result, status }) => {
    return (
      <PhaseTransitionCard
        fromPhase={args.currentPhase}
        toPhase={args.targetPhase}
        status={status.type}
        blockers={result?.blockers}
      />
    );
  },
});

// 2. Token State Update Tool
const TokenStateToolUI = makeAssistantToolUI({
  toolName: "update_token_state",
  render: ({ args, result, status }) => {
    return (
      <TokenStateCard
        tokenChanges={args.changes}
        previewRefresh={result?.previewUpdated}
      />
    );
  },
});

// 3. OODS Render Tool
const OODSRenderToolUI = makeAssistantToolUI({
  toolName: "render_component",
  render: ({ args, result, status }) => {
    if (status.type === "running") {
      return <RenderingSkeleton component={args.componentUrn} />;
    }
    return (
      <RenderPreview
        html={result?.html}
        cssVars={result?.cssVariables}
      />
    );
  },
});

// 4. Review Gate Tool (Human-in-the-Loop)
const ReviewGateToolUI = makeAssistantToolUI({
  toolName: "request_review",
  render: ({ args, result, status }) => {
    return (
      <ReviewGateCard
        phase={args.phase}
        deliverables={args.deliverables}
        onApprove={() => { /* approve handler */ }}
        onReject={() => { /* reject handler */ }}
      />
    );
  },
});
```

### 3.3 Human-in-the-Loop (HITL) for Review Gates

Assistant-ui has built-in HITL support:

```typescript
const runtime = useLocalRuntime(MyModelAdapter, {
  // These tools require user approval before execution
  unstable_humanToolNames: [
    "request_review",
    "complete_phase",
    "apply_design_changes",
  ],
});
```

---

## Part 4: Integration with Synthesis Workbench State

### 4.1 TokenState ↔ Assistant-UI Bridge

The workbench needs to sync TokenState with the chat context:

```typescript
// useAssistantInstructions for system context
import { useAssistantInstructions } from "@assistant-ui/react";

function WorkbenchProvider({ children }) {
  const tokenState = useTokenState();
  const currentPhase = usePhaseState();
  const stage1Bundle = useStage1Bundle();

  // Inject context into assistant
  useAssistantInstructions(`
    You are a design orchestration assistant for Synthesis Workbench.
    
    Current Phase: ${currentPhase}
    
    TokenState:
    ${JSON.stringify(tokenState, null, 2)}
    
    Stage1 Research Bundle Available: ${!!stage1Bundle}
    ${stage1Bundle ? `Research Summary: ${stage1Bundle.summary}` : ""}
    
    Available OODS Components: ${stage1Bundle?.detectedComponents?.join(", ")}
  `);

  return children;
}
```

### 4.2 State Synchronization Pattern

```typescript
// Zustand store for TokenState
const useTokenStateStore = create<TokenStateStore>((set) => ({
  tokens: {},
  setToken: (key, value) => set((state) => ({
    tokens: { ...state.tokens, [key]: value }
  })),
}));

// Adapter that updates TokenState from tool results
const SynthesisAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal, context }) {
    // Forward to LLM
    const stream = await llmCall(messages, abortSignal);
    
    for await (const chunk of stream) {
      // If tool call includes token updates, sync to store
      if (chunk.toolCalls) {
        for (const call of chunk.toolCalls) {
          if (call.toolName === "update_token_state") {
            useTokenStateStore.getState().setToken(
              call.args.token,
              call.args.value
            );
          }
        }
      }
      
      yield chunk;
    }
  },
};
```

---

## Part 5: Preview Integration

### 5.1 Simple iframe Architecture

Per research findings, we use a simple iframe with `srcdoc` injection:

```typescript
// PreviewPane.tsx
interface PreviewPaneProps {
  tokenState: TokenState;
  html: string;  // From OODS Foundry
}

const PreviewPane: React.FC<PreviewPaneProps> = ({ tokenState, html }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Inject CSS variables from TokenState
  const cssVars = Object.entries(tokenState)
    .map(([key, value]) => `--${key}: ${value};`)
    .join("\n");

  const srcdoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          :root {
            ${cssVars}
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts"
      className="w-full h-full border-0"
    />
  );
};
```

### 5.2 postMessage for Dynamic Updates

```typescript
// Parent (Workbench)
useEffect(() => {
  iframeRef.current?.contentWindow?.postMessage({
    type: "TOKEN_STATE_UPDATE",
    payload: tokenState,
  }, "*");
}, [tokenState]);

// Inside iframe (injected script)
window.addEventListener("message", (event) => {
  if (event.data.type === "TOKEN_STATE_UPDATE") {
    const tokens = event.data.payload;
    Object.entries(tokens).forEach(([key, value]) => {
      document.documentElement.style.setProperty(`--${key}`, value);
    });
  }
});
```

### 5.3 Preview Update Script (Injected)

```typescript
// lib/preview/inject-script.ts
export const PREVIEW_INJECT_SCRIPT = `
<script>
  window.addEventListener("message", (event) => {
    if (event.data.type === "TOKEN_STATE_UPDATE") {
      const tokens = event.data.payload;
      Object.entries(tokens).forEach(([key, value]) => {
        document.documentElement.style.setProperty("--" + key, value);
      });
      // Dispatch custom event for components that need to react
      window.dispatchEvent(new CustomEvent("oods:token-update", { detail: tokens }));
    }
    
    if (event.data.type === "COMPONENT_UPDATE") {
      const { html, targetId } = event.data.payload;
      const target = targetId 
        ? document.getElementById(targetId)
        : document.body;
      if (target) {
        target.innerHTML = html;
      }
    }
  });
  
  // Signal ready
  window.parent.postMessage({ type: "PREVIEW_READY" }, "*");
</script>
`;
```

---

## Part 6: Component Architecture

### 6.1 File Structure

```
synthesis-workbench/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── chat/
│   │   │       └── route.ts          # LLM API endpoint
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── components/
│   │   ├── assistant-ui/             # From shadcn add
│   │   │   ├── thread.tsx
│   │   │   ├── thread-list.tsx
│   │   │   ├── attachment.tsx
│   │   │   ├── markdown-text.tsx
│   │   │   └── tool-fallback.tsx
│   │   │
│   │   ├── workbench/                # Our custom components
│   │   │   ├── WorkbenchLayout.tsx
│   │   │   ├── ChatPane.tsx
│   │   │   ├── PreviewPane.tsx
│   │   │   ├── TokenControlsPanel.tsx
│   │   │   ├── PhaseProgress.tsx
│   │   │   └── ResearchContext.tsx
│   │   │
│   │   └── tool-uis/                 # Custom tool renderers
│   │       ├── PhaseTransitionCard.tsx
│   │       ├── TokenStateCard.tsx
│   │       ├── OODSRenderPreview.tsx
│   │       └── ReviewGateCard.tsx
│   │
│   ├── lib/
│   │   ├── runtime/
│   │   │   ├── adapters/
│   │   │   │   ├── ollama.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   └── index.ts
│   │   │   ├── tools/
│   │   │   │   ├── phase-tools.ts
│   │   │   │   ├── token-tools.ts
│   │   │   │   └── oods-tools.ts
│   │   │   └── RuntimeProvider.tsx
│   │   │
│   │   ├── mcp/                      # MCP client layer
│   │   │   ├── client.ts
│   │   │   ├── oods-proxy.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── preview/
│   │   │   ├── inject-script.ts
│   │   │   └── message-types.ts
│   │   │
│   │   └── stores/
│   │       ├── token-state.ts
│   │       ├── phase-state.ts
│   │       └── stage1-bundle.ts
│   │
│   └── types/
│       ├── token-state.ts
│       ├── phase.ts
│       ├── stage1-bundle.ts
│       └── oods.ts
│
├── package.json
└── next.config.js
```

### 6.2 Package Dependencies

```json
{
  "dependencies": {
    "@assistant-ui/react": "^latest",
    "@assistant-ui/react-markdown": "^latest",
    "@assistant-ui/react-ai-sdk": "^latest",
    "ai": "^latest",
    "ollama-ai-provider-v2": "^latest",
    "zustand": "^5.0.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "remark-gfm": "^latest",
    "zod": "^3.23.0"
  }
}
```

---

## Part 7: Implementation Phases

### Phase 1: Core Chat (Week 1)
- [ ] Next.js 15 project setup
- [ ] Install assistant-ui via `npx assistant-ui@latest init`
- [ ] Create Ollama adapter
- [ ] Basic chat working with local LLM
- [ ] Anthropic adapter as fallback

### Phase 2: Tool UI (Week 2)
- [ ] Define tool schemas for OODS operations
- [ ] Implement `makeAssistantToolUI` for each tool type
- [ ] Wire up HITL for review gates
- [ ] Test tool rendering with mock data

### Phase 3: State Integration (Week 3)
- [ ] Zustand stores for TokenState, PhaseState
- [ ] `useAssistantInstructions` context injection
- [ ] Tool result → state sync
- [ ] Preview pane with iframe

### Phase 4: OODS Foundry Connection (Week 4)
- [ ] MCP client for OODS Foundry tools
- [ ] Real component rendering
- [ ] TokenState → CSS variable injection
- [ ] Full preview loop working

---

## Part 8: Key Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | LocalRuntime | Built-in state, simpler setup, backend-agnostic |
| LLM Provider | Ollama-first, Anthropic fallback | Local-first for privacy, cloud backup |
| State | Zustand | Matches assistant-ui internals, simple API |
| Preview | Simple iframe + srcdoc | Research validated: no WebContainers needed |
| Tool UI | makeAssistantToolUI | Declarative lifecycle handling |
| Styling | Tailwind + shadcn/ui | Matches assistant-ui defaults |
| MCP Integration | Tool proxy pattern | LLM calls tools, workbench proxies to MCP |

---

## Part 9: Risk Mitigation

### 9.1 Ollama Availability
**Risk:** Ollama not running when workbench starts  
**Mitigation:** Health check on startup, clear error UI, option to switch to cloud

### 9.2 Tool Call Streaming
**Risk:** Tool UI flickers during streaming (known issue from docs)  
**Mitigation:** Accumulate tool call state outside loop per official guidance

### 9.3 Context Window Limits
**Risk:** Stage1 bundle + conversation history exceeds context  
**Mitigation:** Smart context management, summarization, message windowing

### 9.4 MCP Connection Failures
**Risk:** OODS Foundry MCP server unavailable  
**Mitigation:** Graceful degradation, mock responses for development, retry logic

---

## Part 10: OODS Foundry MCP Integration

### 10.1 Available MCP Tools

OODS Foundry MCP server exposes these tools (from `docs/mcp/Tool-Specs.md`):

| Tool | Status | Purpose |
|------|--------|---------|
| `repl.render` | Auto | Render Design Lab previews (UI Schema → HTML) |
| `repl.validate` | Auto | Validate Design Lab schemas |
| `tokens.build` | Auto | Build token artifacts |
| `brand.apply` | Auto | Apply brand overlays |
| `structuredData.fetch` | Auto | Read structured data exports |
| `diag.snapshot` | On-demand | Diagnostics snapshot |
| `a11y.scan` | On-demand | Accessibility audit |
| `purity.audit` | On-demand | Design system purity audit |
| `vrt.run` | On-demand | Visual regression testing |

### 10.2 Tool Proxy Architecture

The LLM doesn't call MCP directly. Instead, the workbench intercepts tool calls and proxies them:

```
┌─────────────┐    tool call    ┌──────────────────┐    MCP     ┌─────────────────┐
│     LLM     │ ─────────────► │  Workbench Tool  │ ─────────► │  OODS Foundry   │
│  (Ollama/   │                │     Proxy        │            │   MCP Server    │
│  Anthropic) │ ◄───────────── │                  │ ◄───────── │                 │
└─────────────┘   tool result   └──────────────────┘            └─────────────────┘
```

```typescript
// lib/mcp/oods-proxy.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class OODSFoundryProxy {
  private client: Client;
  
  async connect() {
    const transport = new StdioClientTransport({
      command: "node",
      args: ["path/to/oods-mcp-server/dist/index.js"],
    });
    
    this.client = new Client({
      name: "synthesis-workbench",
      version: "1.0.0",
    }, { capabilities: {} });
    
    await this.client.connect(transport);
  }
  
  async render(schema: UiSchema): Promise<RenderOutput> {
    const result = await this.client.callTool({
      name: "repl.render",
      arguments: {
        mode: "full",
        schema,
        options: { includeTree: true },
      },
    });
    return result as RenderOutput;
  }
  
  async validate(schema: UiSchema): Promise<ValidateOutput> {
    const result = await this.client.callTool({
      name: "repl.validate",
      arguments: {
        mode: "full",
        schema,
        options: { checkComponents: true },
      },
    });
    return result as ValidateOutput;
  }
  
  async buildTokens(brand: string, theme: string): Promise<TokensOutput> {
    const result = await this.client.callTool({
      name: "tokens.build",
      arguments: { brand, theme, apply: false },
    });
    return result as TokensOutput;
  }
}
```

### 10.3 Tool Definition for LLM

The LLM needs tool definitions to know what it can call:

```typescript
// lib/runtime/tools/oods-tools.ts
import { z } from "zod";

export const oodsTools = {
  render_component: {
    description: "Render an OODS component using UI Schema format",
    parameters: z.object({
      schema: z.object({
        version: z.string(),
        screens: z.array(z.object({
          id: z.string(),
          component: z.string(),
          props: z.record(z.any()).optional(),
          children: z.array(z.any()).optional(),
        })),
      }),
    }),
    execute: async ({ schema }) => {
      const proxy = getOODSProxy();
      return await proxy.render(schema);
    },
  },
  
  validate_schema: {
    description: "Validate a UI Schema against OODS component registry",
    parameters: z.object({
      schema: z.object({
        version: z.string(),
        screens: z.array(z.any()),
      }),
    }),
    execute: async ({ schema }) => {
      const proxy = getOODSProxy();
      return await proxy.validate(schema);
    },
  },
  
  build_tokens: {
    description: "Build design tokens for a specific brand and theme",
    parameters: z.object({
      brand: z.enum(["A", "B", "C"]),
      theme: z.enum(["light", "dark", "hc"]),
    }),
    execute: async ({ brand, theme }) => {
      const proxy = getOODSProxy();
      return await proxy.buildTokens(brand, theme);
    },
  },
};
```

### 10.4 Error Handling Pattern

```typescript
// lib/mcp/error-handling.ts
export interface MCPError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export function handleMCPError(error: unknown): MCPError {
  if (error instanceof Error) {
    return {
      code: "MCP_ERROR",
      message: error.message,
      details: { stack: error.stack },
    };
  }
  return {
    code: "UNKNOWN_ERROR",
    message: String(error),
  };
}

// In tool execution
async execute({ schema }) {
  try {
    const proxy = getOODSProxy();
    const result = await proxy.render(schema);
    
    if (result.status === "error") {
      return {
        success: false,
        errors: result.errors,
        suggestions: result.errors.map(e => e.hint).filter(Boolean),
      };
    }
    
    return {
      success: true,
      preview: result.preview,
      renderedTree: result.renderedTree,
    };
  } catch (error) {
    return {
      success: false,
      error: handleMCPError(error),
    };
  }
}
```

---

## Part 11: UI Schema Format (OODS Foundry)

### 11.1 Schema Structure

OODS Foundry uses a UI Schema format for defining renderable components:

```typescript
// types/oods.ts
interface UiSchema {
  $schema?: string;
  version: string;           // DSL version (e.g., "1.0.0")
  dsVersion?: string;        // Design system version
  theme?: string;            // Theme identifier
  screens: UiElement[];      // Top-level screens/pages
}

interface UiElement {
  id: string;                // Unique identifier
  component: string;         // Component URN (e.g., "Button", "Card")
  route?: string;            // Optional route for screens
  layout?: Layout;
  style?: Style;
  props?: Record<string, unknown>;
  bindings?: Record<string, string>;  // Data bindings
  children?: UiElement[];
  meta?: ElementMeta;
}

interface Layout {
  type: "stack" | "grid" | "inline" | "section" | "sidebar";
  align?: "start" | "center" | "end" | "space-between";
  gapToken?: string;         // Token reference for gap
}

interface Style {
  spacingToken?: string;
  radiusToken?: string;
  shadowToken?: string;
  colorToken?: string;
  typographyToken?: string;
  [key: string]: string | undefined;  // Additional token references
}

interface ElementMeta {
  label?: string;            // Human-readable label
  intent?: string;           // Design intent
  notes?: string;            // Implementation notes
}
```

### 11.2 Example UI Schema

```json
{
  "version": "1.0.0",
  "dsVersion": "3.2.0",
  "theme": "light",
  "screens": [
    {
      "id": "subscription-card",
      "component": "Card",
      "layout": { "type": "stack", "gapToken": "spacing.md" },
      "style": {
        "radiusToken": "radius.lg",
        "shadowToken": "shadow.md"
      },
      "children": [
        {
          "id": "header",
          "component": "CardHeader",
          "props": { "title": "Pro Plan" },
          "children": [
            {
              "id": "status-badge",
              "component": "StatusChip",
              "props": { "status": "active" },
              "style": { "colorToken": "status.active.surface" }
            }
          ]
        },
        {
          "id": "body",
          "component": "CardBody",
          "children": [
            {
              "id": "price",
              "component": "Text",
              "props": { "variant": "heading-lg" },
              "bindings": { "content": "subscription.price" }
            }
          ]
        }
      ],
      "meta": {
        "label": "Subscription Card",
        "intent": "Display subscription status and pricing"
      }
    }
  ]
}
```

### 11.3 Render Output Format

```typescript
interface RenderOutput {
  status: "ok" | "error";
  mode: "full" | "patch";
  dslVersion: string;
  registryVersion: string | null;
  errors: ReplIssue[];
  warnings: ReplIssue[];
  renderedTree?: UiSchema;
  preview?: {
    screens: string[];        // Screen IDs
    routes: string[];         // Route paths
    activeScreen: string | null;
    summary: string;          // Human-readable summary
    notes?: string[];         // Rendering notes
  };
  meta?: {
    screenCount: number;
    nodeCount: number;
    duplicateIds: string[];
    missingComponents: string[];
  };
}

interface ReplIssue {
  code: string;               // Error code (e.g., "MISSING_SCHEMA")
  message: string;
  path?: string;              // JSON path to error
  hint?: string;              // Fix suggestion
  severity?: "error" | "warning";
  component?: string;         // Component that caused the issue
}
```

---

## Part 12: Phase State Machine

### 12.1 Design Workflow Phases

Synthesis Workbench follows a structured design workflow:

```
┌──────────────────────────────────────────────────────────────────────┐
│                    SYNTHESIS WORKBENCH PHASES                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐          │
│  │ INGEST  │───►│ EXPLORE │───►│  TUNE   │───►│ REVIEW  │──► DONE  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘          │
│       │              │              │              │                │
│       ▼              ▼              ▼              ▼                │
│  Load Stage1   View patterns   Adjust tokens  Human approval       │
│  bundle        Try components  Preview live   Export assets        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 12.2 Phase Definitions

```typescript
// types/phase.ts
export type PhaseId = "ingest" | "explore" | "tune" | "review" | "done";

export interface Phase {
  id: PhaseId;
  label: string;
  description: string;
  entryConditions: EntryCondition[];
  exitConditions: ExitCondition[];
  allowedTools: string[];
  requiresHumanApproval: boolean;
}

export const PHASES: Record<PhaseId, Phase> = {
  ingest: {
    id: "ingest",
    label: "Ingest Research",
    description: "Load and parse Stage1 Inspector research bundle",
    entryConditions: [],  // Starting phase
    exitConditions: [
      { type: "bundle_loaded", check: (state) => !!state.stage1Bundle },
      { type: "components_detected", check: (state) => state.detectedComponents.length > 0 },
    ],
    allowedTools: ["load_bundle", "parse_evidence"],
    requiresHumanApproval: false,
  },
  
  explore: {
    id: "explore",
    label: "Explore Patterns",
    description: "Browse detected patterns and try component variations",
    entryConditions: [
      { type: "from_phase", phases: ["ingest"] },
    ],
    exitConditions: [
      { type: "component_selected", check: (state) => !!state.selectedComponent },
    ],
    allowedTools: ["render_component", "validate_schema", "fetch_structured_data"],
    requiresHumanApproval: false,
  },
  
  tune: {
    id: "tune",
    label: "Tune Tokens",
    description: "Adjust design tokens and see live preview",
    entryConditions: [
      { type: "from_phase", phases: ["explore"] },
      { type: "component_selected", check: (state) => !!state.selectedComponent },
    ],
    exitConditions: [
      { type: "tokens_modified", check: (state) => Object.keys(state.tokenChanges).length > 0 },
      { type: "preview_validated", check: (state) => state.previewValid },
    ],
    allowedTools: ["update_token_state", "render_component", "build_tokens"],
    requiresHumanApproval: false,
  },
  
  review: {
    id: "review",
    label: "Review & Approve",
    description: "Human review of proposed changes before export",
    entryConditions: [
      { type: "from_phase", phases: ["tune"] },
    ],
    exitConditions: [
      { type: "human_approved", check: (state) => state.reviewApproved },
    ],
    allowedTools: ["request_review", "render_component"],
    requiresHumanApproval: true,
  },
  
  done: {
    id: "done",
    label: "Complete",
    description: "Changes approved and ready for export",
    entryConditions: [
      { type: "from_phase", phases: ["review"] },
      { type: "human_approved", check: (state) => state.reviewApproved },
    ],
    exitConditions: [],  // Terminal phase
    allowedTools: ["export_assets"],
    requiresHumanApproval: false,
  },
};
```

### 12.3 Phase State Store

```typescript
// lib/stores/phase-state.ts
import { create } from "zustand";
import { PHASES, PhaseId } from "@/types/phase";

interface PhaseState {
  currentPhase: PhaseId;
  phaseHistory: PhaseId[];
  transitionBlockers: string[];
  
  // Actions
  transitionTo: (phase: PhaseId) => boolean;
  canTransitionTo: (phase: PhaseId) => { allowed: boolean; blockers: string[] };
  reset: () => void;
}

export const usePhaseStore = create<PhaseState>((set, get) => ({
  currentPhase: "ingest",
  phaseHistory: ["ingest"],
  transitionBlockers: [],
  
  transitionTo: (targetPhase) => {
    const { allowed, blockers } = get().canTransitionTo(targetPhase);
    if (!allowed) {
      set({ transitionBlockers: blockers });
      return false;
    }
    
    set((state) => ({
      currentPhase: targetPhase,
      phaseHistory: [...state.phaseHistory, targetPhase],
      transitionBlockers: [],
    }));
    return true;
  },
  
  canTransitionTo: (targetPhase) => {
    const current = get().currentPhase;
    const targetDef = PHASES[targetPhase];
    const blockers: string[] = [];
    
    // Check entry conditions
    for (const condition of targetDef.entryConditions) {
      if (condition.type === "from_phase") {
        if (!condition.phases.includes(current)) {
          blockers.push(`Cannot transition from ${current} to ${targetPhase}`);
        }
      }
      // Additional condition checks would use global state
    }
    
    return { allowed: blockers.length === 0, blockers };
  },
  
  reset: () => set({
    currentPhase: "ingest",
    phaseHistory: ["ingest"],
    transitionBlockers: [],
  }),
}));
```

### 12.4 Phase Transition Tool

```typescript
// lib/runtime/tools/phase-tools.ts
import { z } from "zod";
import { usePhaseStore } from "@/lib/stores/phase-state";
import { PhaseId, PHASES } from "@/types/phase";

export const phaseTools = {
  transition_phase: {
    description: "Transition to a new workflow phase",
    parameters: z.object({
      targetPhase: z.enum(["ingest", "explore", "tune", "review", "done"]),
      reason: z.string().optional(),
    }),
    execute: async ({ targetPhase, reason }) => {
      const store = usePhaseStore.getState();
      const { allowed, blockers } = store.canTransitionTo(targetPhase as PhaseId);
      
      if (!allowed) {
        return {
          success: false,
          currentPhase: store.currentPhase,
          targetPhase,
          blockers,
          suggestion: `Complete these requirements first: ${blockers.join(", ")}`,
        };
      }
      
      store.transitionTo(targetPhase as PhaseId);
      
      return {
        success: true,
        previousPhase: store.phaseHistory[store.phaseHistory.length - 2],
        currentPhase: targetPhase,
        allowedTools: PHASES[targetPhase as PhaseId].allowedTools,
        nextSteps: getNextStepsForPhase(targetPhase as PhaseId),
      };
    },
  },
  
  get_phase_status: {
    description: "Get current phase and available transitions",
    parameters: z.object({}),
    execute: async () => {
      const store = usePhaseStore.getState();
      const currentDef = PHASES[store.currentPhase];
      
      // Check which phases we can transition to
      const availableTransitions = Object.keys(PHASES)
        .filter(phase => {
          const { allowed } = store.canTransitionTo(phase as PhaseId);
          return allowed;
        });
      
      return {
        currentPhase: store.currentPhase,
        phaseLabel: currentDef.label,
        description: currentDef.description,
        allowedTools: currentDef.allowedTools,
        requiresHumanApproval: currentDef.requiresHumanApproval,
        availableTransitions,
        history: store.phaseHistory,
      };
    },
  },
};

function getNextStepsForPhase(phase: PhaseId): string[] {
  switch (phase) {
    case "ingest":
      return ["Load a Stage1 research bundle", "View detected components"];
    case "explore":
      return ["Browse component patterns", "Select a component to customize"];
    case "tune":
      return ["Adjust token values", "Preview changes in real-time"];
    case "review":
      return ["Review all changes", "Approve or request modifications"];
    case "done":
      return ["Export final assets", "Start new design session"];
  }
}
```

---

## Part 13: Stage1 Bundle Format

### 13.1 Bundle Structure

Stage1 Inspector produces a research bundle containing evidence from design extraction:

```typescript
// types/stage1-bundle.ts
export interface Stage1Bundle {
  metadata: BundleMetadata;
  target: TargetInfo;
  evidence: Evidence;
  analysis: Analysis;
  recommendations: Recommendation[];
}

interface BundleMetadata {
  version: string;           // Bundle format version
  createdAt: string;         // ISO timestamp
  inspectorVersion: string;  // Stage1 Inspector version
  namespace?: string;        // Multi-target namespace
}

interface TargetInfo {
  url: string;               // Inspected URL
  title: string;             // Page title
  viewport: {
    width: number;
    height: number;
  };
  screenshots: Screenshot[];
}

interface Screenshot {
  id: string;
  type: "full" | "viewport" | "element";
  path: string;              // Relative path in bundle
  elementSelector?: string;  // For element screenshots
  timestamp: string;
}

interface Evidence {
  dom: DOMEvidence;
  styles: StyleEvidence;
  components: ComponentEvidence[];
}

interface DOMEvidence {
  structure: ElementNode[];  // Simplified DOM tree
  landmarks: Landmark[];     // ARIA landmarks
  headingTree: HeadingNode[];
}

interface StyleEvidence {
  computedStyles: Record<string, ComputedStyleSet>;
  colorPalette: ColorToken[];
  typographyScale: TypographyToken[];
  spacingScale: SpacingToken[];
}

interface ComponentEvidence {
  id: string;
  type: string;              // Detected component type
  selector: string;          // CSS selector
  confidence: number;        // Detection confidence (0-1)
  boundingBox: BoundingBox;
  traits: string[];          // Detected OODS traits
  tokens: TokenBinding[];    // Detected token usage
}

interface Analysis {
  patterns: PatternMatch[];
  tokenCoverage: TokenCoverage;
  accessibilityScore: number;
  designSystemAlignment: AlignmentScore;
}

interface Recommendation {
  type: "component" | "token" | "pattern" | "accessibility";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  suggestedAction: string;
  relatedEvidence: string[];  // Evidence IDs
}
```

### 13.2 Bundle Loading

```typescript
// lib/stores/stage1-bundle.ts
import { create } from "zustand";
import type { Stage1Bundle } from "@/types/stage1-bundle";

interface Stage1BundleState {
  bundle: Stage1Bundle | null;
  loading: boolean;
  error: string | null;
  
  // Derived state
  detectedComponents: string[];
  tokenSuggestions: Record<string, string>;
  
  // Actions
  loadBundle: (file: File) => Promise<void>;
  clearBundle: () => void;
}

export const useStage1BundleStore = create<Stage1BundleState>((set, get) => ({
  bundle: null,
  loading: false,
  error: null,
  detectedComponents: [],
  tokenSuggestions: {},
  
  loadBundle: async (file: File) => {
    set({ loading: true, error: null });
    
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as Stage1Bundle;
      
      // Validate bundle format
      if (!bundle.metadata?.version || !bundle.evidence) {
        throw new Error("Invalid Stage1 bundle format");
      }
      
      // Extract derived state
      const detectedComponents = bundle.evidence.components.map(c => c.type);
      const tokenSuggestions = extractTokenSuggestions(bundle);
      
      set({
        bundle,
        loading: false,
        detectedComponents,
        tokenSuggestions,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load bundle",
      });
    }
  },
  
  clearBundle: () => set({
    bundle: null,
    detectedComponents: [],
    tokenSuggestions: {},
    error: null,
  }),
}));

function extractTokenSuggestions(bundle: Stage1Bundle): Record<string, string> {
  const suggestions: Record<string, string> = {};
  
  // Map detected colors to token suggestions
  for (const color of bundle.evidence.styles.colorPalette) {
    suggestions[`color-${color.id}`] = color.suggestedToken || color.value;
  }
  
  // Map typography to tokens
  for (const type of bundle.evidence.styles.typographyScale) {
    suggestions[`typography-${type.id}`] = type.suggestedToken || type.value;
  }
  
  return suggestions;
}
```

### 13.3 Bundle Load Tool

```typescript
// lib/runtime/tools/stage1-tools.ts
import { z } from "zod";
import { useStage1BundleStore } from "@/lib/stores/stage1-bundle";

export const stage1Tools = {
  load_bundle: {
    description: "Load a Stage1 Inspector research bundle",
    parameters: z.object({
      bundleData: z.string().describe("Base64 encoded bundle JSON"),
    }),
    execute: async ({ bundleData }) => {
      const store = useStage1BundleStore.getState();
      
      try {
        const decoded = atob(bundleData);
        const blob = new Blob([decoded], { type: "application/json" });
        const file = new File([blob], "bundle.json");
        
        await store.loadBundle(file);
        
        const { bundle, detectedComponents, tokenSuggestions } = useStage1BundleStore.getState();
        
        return {
          success: true,
          metadata: bundle?.metadata,
          targetUrl: bundle?.target.url,
          componentCount: detectedComponents.length,
          detectedComponents,
          tokenSuggestionCount: Object.keys(tokenSuggestions).length,
          summary: generateBundleSummary(bundle!),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to load bundle",
        };
      }
    },
  },
  
  get_bundle_evidence: {
    description: "Get specific evidence from the loaded Stage1 bundle",
    parameters: z.object({
      evidenceType: z.enum(["dom", "styles", "components", "analysis"]),
    }),
    execute: async ({ evidenceType }) => {
      const { bundle } = useStage1BundleStore.getState();
      
      if (!bundle) {
        return { success: false, error: "No bundle loaded" };
      }
      
      switch (evidenceType) {
        case "dom":
          return { success: true, evidence: bundle.evidence.dom };
        case "styles":
          return { success: true, evidence: bundle.evidence.styles };
        case "components":
          return { success: true, evidence: bundle.evidence.components };
        case "analysis":
          return { success: true, evidence: bundle.analysis };
      }
    },
  },
};

function generateBundleSummary(bundle: Stage1Bundle): string {
  const components = bundle.evidence.components;
  const colors = bundle.evidence.styles.colorPalette.length;
  const typography = bundle.evidence.styles.typographyScale.length;
  
  return `
Analyzed: ${bundle.target.url}
Found ${components.length} components, ${colors} colors, ${typography} typography styles.
Design system alignment: ${Math.round(bundle.analysis.designSystemAlignment.score * 100)}%
Accessibility score: ${Math.round(bundle.analysis.accessibilityScore * 100)}%
${bundle.recommendations.length} recommendations generated.
  `.trim();
}
```

---

## Part 14: TokenState Schema

### 14.1 TokenState Structure

```typescript
// types/token-state.ts
export interface TokenState {
  // Color tokens
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: {
      primary: string;
      secondary: string;
      disabled: string;
    };
    status: {
      success: string;
      warning: string;
      error: string;
      info: string;
    };
    border: string;
  };
  
  // Typography tokens
  typography: {
    fontFamily: {
      sans: string;
      mono: string;
    };
    fontSize: {
      xs: string;
      sm: string;
      base: string;
      lg: string;
      xl: string;
      "2xl": string;
      "3xl": string;
    };
    fontWeight: {
      normal: string;
      medium: string;
      semibold: string;
      bold: string;
    };
    lineHeight: {
      tight: string;
      normal: string;
      relaxed: string;
    };
  };
  
  // Spacing tokens
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    "2xl": string;
  };
  
  // Border radius tokens
  radius: {
    none: string;
    sm: string;
    md: string;
    lg: string;
    full: string;
  };
  
  // Shadow tokens
  shadow: {
    sm: string;
    md: string;
    lg: string;
  };
  
  // Custom tokens (from Stage1 analysis)
  custom: Record<string, string>;
}

// Default token values
export const DEFAULT_TOKEN_STATE: TokenState = {
  colors: {
    primary: "#3b82f6",
    secondary: "#64748b",
    accent: "#f59e0b",
    background: "#ffffff",
    surface: "#f8fafc",
    text: {
      primary: "#0f172a",
      secondary: "#475569",
      disabled: "#94a3b8",
    },
    status: {
      success: "#22c55e",
      warning: "#f59e0b",
      error: "#ef4444",
      info: "#3b82f6",
    },
    border: "#e2e8f0",
  },
  typography: {
    fontFamily: {
      sans: "Inter, system-ui, sans-serif",
      mono: "JetBrains Mono, monospace",
    },
    fontSize: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
    },
    fontWeight: {
      normal: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },
    lineHeight: {
      tight: "1.25",
      normal: "1.5",
      relaxed: "1.75",
    },
  },
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
    "2xl": "3rem",
  },
  radius: {
    none: "0",
    sm: "0.25rem",
    md: "0.375rem",
    lg: "0.5rem",
    full: "9999px",
  },
  shadow: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
  },
  custom: {},
};
```

### 14.2 TokenState Store

```typescript
// lib/stores/token-state.ts
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { TokenState, DEFAULT_TOKEN_STATE } from "@/types/token-state";

interface TokenStateStore {
  tokens: TokenState;
  changes: Record<string, { from: string; to: string }>;
  
  // Actions
  setToken: (path: string, value: string) => void;
  setTokens: (updates: Record<string, string>) => void;
  resetToken: (path: string) => void;
  resetAll: () => void;
  
  // Derived
  toCssVariables: () => Record<string, string>;
  getChanges: () => Record<string, { from: string; to: string }>;
}

export const useTokenStateStore = create<TokenStateStore>()(
  subscribeWithSelector((set, get) => ({
    tokens: DEFAULT_TOKEN_STATE,
    changes: {},
    
    setToken: (path, value) => {
      const current = getNestedValue(get().tokens, path);
      
      set((state) => ({
        tokens: setNestedValue(state.tokens, path, value),
        changes: {
          ...state.changes,
          [path]: { from: current, to: value },
        },
      }));
    },
    
    setTokens: (updates) => {
      set((state) => {
        let newTokens = { ...state.tokens };
        const newChanges = { ...state.changes };
        
        for (const [path, value] of Object.entries(updates)) {
          const current = getNestedValue(state.tokens, path);
          newTokens = setNestedValue(newTokens, path, value);
          newChanges[path] = { from: current, to: value };
        }
        
        return { tokens: newTokens, changes: newChanges };
      });
    },
    
    resetToken: (path) => {
      const defaultValue = getNestedValue(DEFAULT_TOKEN_STATE, path);
      
      set((state) => {
        const newChanges = { ...state.changes };
        delete newChanges[path];
        
        return {
          tokens: setNestedValue(state.tokens, path, defaultValue),
          changes: newChanges,
        };
      });
    },
    
    resetAll: () => set({
      tokens: DEFAULT_TOKEN_STATE,
      changes: {},
    }),
    
    toCssVariables: () => {
      const tokens = get().tokens;
      return flattenToCssVars(tokens);
    },
    
    getChanges: () => get().changes,
  }))
);

// Helper functions
function getNestedValue(obj: any, path: string): string {
  return path.split(".").reduce((acc, key) => acc?.[key], obj) ?? "";
}

function setNestedValue<T>(obj: T, path: string, value: string): T {
  const keys = path.split(".");
  const result = { ...obj } as any;
  let current = result;
  
  for (let i = 0; i < keys.length - 1; i++) {
    current[keys[i]] = { ...current[keys[i]] };
    current = current[keys[i]];
  }
  
  current[keys[keys.length - 1]] = value;
  return result;
}

function flattenToCssVars(obj: any, prefix = ""): Record<string, string> {
  const vars: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const varName = prefix ? `${prefix}-${key}` : key;
    
    if (typeof value === "object" && value !== null) {
      Object.assign(vars, flattenToCssVars(value, varName));
    } else {
      vars[`--${varName}`] = String(value);
    }
  }
  
  return vars;
}
```

### 14.3 Token Update Tool

```typescript
// lib/runtime/tools/token-tools.ts
import { z } from "zod";
import { useTokenStateStore } from "@/lib/stores/token-state";

export const tokenTools = {
  update_token_state: {
    description: "Update one or more design tokens",
    parameters: z.object({
      changes: z.record(z.string()).describe("Token path to new value mapping"),
    }),
    execute: async ({ changes }) => {
      const store = useTokenStateStore.getState();
      
      // Validate paths exist
      const invalidPaths: string[] = [];
      for (const path of Object.keys(changes)) {
        try {
          getNestedValue(store.tokens, path);
        } catch {
          invalidPaths.push(path);
        }
      }
      
      if (invalidPaths.length > 0) {
        return {
          success: false,
          error: `Invalid token paths: ${invalidPaths.join(", ")}`,
        };
      }
      
      store.setTokens(changes);
      
      return {
        success: true,
        updatedTokens: Object.keys(changes),
        previewUpdated: true,
        cssVariables: Object.fromEntries(
          Object.keys(changes).map(path => [
            `--${path.replace(/\./g, "-")}`,
            changes[path],
          ])
        ),
      };
    },
  },
  
  get_token_state: {
    description: "Get current token values and any uncommitted changes",
    parameters: z.object({
      category: z.enum(["colors", "typography", "spacing", "radius", "shadow", "custom", "all"]).optional(),
    }),
    execute: async ({ category = "all" }) => {
      const store = useTokenStateStore.getState();
      
      if (category === "all") {
        return {
          tokens: store.tokens,
          changes: store.changes,
          cssVariables: store.toCssVariables(),
        };
      }
      
      return {
        tokens: store.tokens[category as keyof TokenState],
        changes: Object.fromEntries(
          Object.entries(store.changes).filter(([path]) => path.startsWith(category))
        ),
      };
    },
  },
  
  reset_tokens: {
    description: "Reset tokens to default values",
    parameters: z.object({
      paths: z.array(z.string()).optional().describe("Specific paths to reset, or all if omitted"),
    }),
    execute: async ({ paths }) => {
      const store = useTokenStateStore.getState();
      
      if (!paths || paths.length === 0) {
        store.resetAll();
        return { success: true, message: "All tokens reset to defaults" };
      }
      
      for (const path of paths) {
        store.resetToken(path);
      }
      
      return {
        success: true,
        resetPaths: paths,
        remainingChanges: Object.keys(store.getChanges()),
      };
    },
  },
};
```

---

## Part 15: Complete Tool Registry

### 15.1 All Available Tools

```typescript
// lib/runtime/tools/index.ts
import { phaseTools } from "./phase-tools";
import { tokenTools } from "./token-tools";
import { oodsTools } from "./oods-tools";
import { stage1Tools } from "./stage1-tools";

export const ALL_TOOLS = {
  // Phase management
  ...phaseTools,
  
  // Token manipulation
  ...tokenTools,
  
  // OODS Foundry integration
  ...oodsTools,
  
  // Stage1 bundle handling
  ...stage1Tools,
};

// Tool categories for filtering
export const TOOL_CATEGORIES = {
  phase: ["transition_phase", "get_phase_status"],
  tokens: ["update_token_state", "get_token_state", "reset_tokens"],
  oods: ["render_component", "validate_schema", "build_tokens"],
  stage1: ["load_bundle", "get_bundle_evidence"],
};

// Get tools allowed for current phase
export function getToolsForPhase(phase: PhaseId): string[] {
  return PHASES[phase].allowedTools;
}
```

### 15.2 Tool Registration with Assistant-UI

```typescript
// lib/runtime/RuntimeProvider.tsx
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { ALL_TOOLS, getToolsForPhase } from "./tools";
import { usePhaseStore } from "../stores/phase-state";

export function WorkbenchRuntimeProvider({ children }: { children: React.ReactNode }) {
  const currentPhase = usePhaseStore((s) => s.currentPhase);
  const allowedTools = getToolsForPhase(currentPhase);
  
  const runtime = useLocalRuntime(SynthesisAdapter, {
    tools: Object.fromEntries(
      Object.entries(ALL_TOOLS).filter(([name]) => allowedTools.includes(name))
    ),
    unstable_humanToolNames: ["request_review", "complete_phase"],
  });
  
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

---

## Appendix A: Gemini 3 Research Summary

### Report 1: Chat Component Libraries (4,047 words)
- **Verdict:** Assistant UI wins for design system purists and backend-agnostic needs
- **Key finding:** "LangGraph + Assistant UI is emerging as a powerful 'best-of-breed' stack"
- **Community:** 400k+ monthly downloads, 7.6k GitHub stars

### Report 2: Chat+Preview Architectures (5,090 words)
- **Three lanes identified:** Browser-First (WebContainers), Local-First (Docker), Component Lane (Sandpack)
- **OpenWebUI:** 119k stars, Svelte + Python, native Ollama integration, MIT (with branding restriction)
- **Licensing warning:** FSL (Functional Source License) trend for "source available"

### Report 3: Preview/Sandbox Technologies (4,605 words)
- **Verdict for design systems:** Simple iframe or Sandpack Client approaches are superior
- **State injection validated:** Exact code pattern for CSS variables via `srcdoc`
- **Licensing traps:** Sandpack Nodebox NOT Apache 2.0, WebContainers $27k/yr

---

## Appendix B: References

1. [assistant-ui Documentation](https://www.assistant-ui.com/docs/getting-started)
2. [LocalRuntime API](https://www.assistant-ui.com/docs/runtimes/custom/local)
3. [makeAssistantToolUI Guide](https://www.assistant-ui.com/docs/copilots/make-assistant-tool-ui)
4. [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
5. [OODS Foundry MCP Tool Specs](./OODS-Foundry-mcp/docs/mcp/Tool-Specs.md)
6. [OODS Foundry UI Schema](./OODS-Foundry-mcp/packages/mcp-server/src/schemas/repl.ui.schema.json)
7. TraceLab Research Documents:
   - WORKBENCH-ARCH-01 (Chat + Canvas Survey)
   - WORKBENCH-ARCH-02 (AI Chat Libraries)
   - WORKBENCH-ARCH-03 (Preview Technologies)
   - Gemini 3 Deep Research Reports (318b029f, c986c35a, 00026d22)
