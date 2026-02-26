import fs from "node:fs/promises";
import path from "node:path";

import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { withToolCommands } from "@/lib/runtime/adapters/withToolCommands";
import { executeSetDocument } from "@/lib/runtime/tools/document-tools";
import { executeExportDesign } from "@/lib/runtime/tools/export-tools";
import { renderComponent } from "@/lib/runtime/tools/oods-tools";
import { validateSchema } from "@/lib/runtime/tools/validate-tools";
import { buildStage1BundleFromRun } from "@/lib/stage1/bundle-loader";
import { resetStage1BundleStore, useStage1BundleStore } from "@/lib/stores/stage1-bundle";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { useDataContextStore } from "@/lib/stores/data-context";
import { resetPhaseState, usePhaseStore } from "@/lib/stores/phase-state";
import { resetPreviewState, usePreviewStateStore } from "@/lib/stores/preview-state";
import { resetTokenState, useTokenStateStore } from "@/lib/stores/token-state";
import type { Stage1McpClient, Stage1RunSummary } from "@/lib/mcp/stage1-client";
import { DEFAULT_PHASES } from "@/types/phase";
import { buildPreviewSrcDoc } from "@/components/workbench/PreviewPane";

const { mockValidate, mockRender } = vi.hoisted(() => ({
  mockValidate: vi.fn(),
  mockRender: vi.fn(),
}));

vi.mock("@/lib/mcp/foundry-client", () => ({
  getFoundryMcpClient: vi.fn(() => ({
    validate: mockValidate,
    render: mockRender,
  })),
}));

const fixtureClient: Stage1McpClient = {
  listRuns: async () => [],
  getArtifact: async (runDir, artifactName) => {
    const candidatePaths = artifactName.startsWith("../")
      ? [path.resolve(runDir, artifactName)]
      : [
          path.resolve(runDir, artifactName),
          path.resolve(runDir, "artifacts", artifactName),
        ];

    for (const candidatePath of candidatePaths) {
      try {
        const raw = await fs.readFile(candidatePath, "utf8");
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      } catch {
        continue;
      }
    }

    throw new Error(`Artifact not found: ${artifactName}`);
  },
};

const createUserMessage = (id: string, text: string): ThreadMessage => ({
  id,
  createdAt: new Date(),
  role: "user",
  content: [{ type: "text", text }],
  attachments: [],
  metadata: { custom: {} },
});

const createRunOptions = (
  messages: ThreadMessage[],
  currentMessage: ThreadMessage = messages[messages.length - 1]
): ChatModelRunOptions => ({
  messages,
  runConfig: {},
  abortSignal: new AbortController().signal,
  context: {},
  config: {},
  unstable_getMessage: () => currentMessage,
});

const runOnce = async (
  adapter: ChatModelAdapter,
  runOptions: ChatModelRunOptions
): Promise<ChatModelRunResult> => {
  const runResult = adapter.run(runOptions);
  if (
    typeof runResult === "object" &&
    runResult !== null &&
    Symbol.asyncIterator in runResult
  ) {
    const update = await (
      runResult as AsyncGenerator<ChatModelRunResult, void>
    ).next();
    if (update.done || !update.value) {
      throw new Error("Expected at least one run result update.");
    }
    return update.value;
  }

  return await runResult;
};

const createAdapter = () => {
  const run: ChatModelAdapter["run"] = vi.fn(async () => ({
    content: [{ type: "text", text: "fallback" }],
    status: { type: "complete", reason: "stop" },
  }));
  return { run };
};

describe("Sprint 7 E2E phase workflow", () => {
  beforeEach(() => {
    resetPhaseState();
    resetStage1BundleStore();
    resetTokenState();
    resetPreviewState();
    useDocumentStateStore.getState().reset();
    useDataContextStore.getState().reset();

    mockValidate.mockReset();
    mockRender.mockReset();
    mockValidate.mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [],
      raw: {},
    });
    mockRender.mockResolvedValue({
      html: "<main><button>Primary</button><button>Secondary</button></main>",
      warnings: [],
      raw: {},
    });
  });

  it("executes ingest->explore->tune->review->done flow and exports valid outputs", async () => {
    const adapter = createAdapter();
    const wrapped = withToolCommands(adapter);

    // Ingest phase: /bundle is allowed and provides tool call wiring.
    const ingestBundle = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-1", "/bundle")])
    );
    const ingestBundleTool = ingestBundle.content?.find(
      (part) => part.type === "tool-call"
    );
    expect(ingestBundleTool?.type).toBe("tool-call");
    if (ingestBundleTool?.type === "tool-call") {
      expect(ingestBundleTool.toolName).toBe("load_bundle");
    }

    // Load a real Stage1 fixture bundle into the ingestion store.
    const run: Stage1RunSummary = {
      runId: "2a5b9fd2-18f0-406d-a18c-4d72c0085aa5",
      hostname: "example.com",
      runDir: path.resolve(
        process.cwd(),
        "../Stage1/test-out-clusters-2/stage1/example.com/2a5b9fd2-18f0-406d-a18c-4d72c0085aa5"
      ),
    };
    const bundle = await buildStage1BundleFromRun(run, fixtureClient);
    const loadOutcome = useStage1BundleStore.getState().loadBundle(bundle);
    expect(loadOutcome.ok).toBe(true);
    expect(loadOutcome.componentCount).toBeGreaterThan(0);
    expect(loadOutcome.tokenSuggestionCount).toBeGreaterThan(0);

    // Explore phase and gating behavior.
    const toExplore = usePhaseStore.getState().transitionTo("explore", DEFAULT_PHASES);
    expect(toExplore.allowed).toBe(true);

    const blockedBundleInExplore = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-2", "/bundle")])
    );
    const blockedText = blockedBundleInExplore.content?.find(
      (part) => part.type === "text"
    );
    expect(blockedText?.type).toBe("text");
    if (blockedText?.type === "text") {
      expect(blockedText.text).toContain("load_bundle");
      expect(blockedText.text).toContain("explore");
    }

    const schema = {
      version: "2025.11",
      screens: [{ id: "phase-flow", component: "ArchiveSummary" }],
    };
    const validateResult = await validateSchema({
      requestId: "validate-e2e",
      schema,
    });
    expect(validateResult.valid).toBe(true);

    const renderResult = await renderComponent({
      requestId: "render-e2e",
      schema,
      validate: true,
    });
    expect(renderResult.rendered).toBe(true);
    expect(renderResult.documentSet).toBe(true);
    expect(useDocumentStateStore.getState().document?.root).toMatchObject({
      nodeType: "component",
      ref: "oods:ArchiveSummary",
    });

    const setDocResult = await executeSetDocument({
      requestId: "doc-e2e",
      document: {
        metadata: { title: "Sprint 7 Flow" },
        root: {
          nodeType: "layout",
          layout: { type: "stack", gap: 16 },
          children: [
            {
              nodeType: "component",
              id: "btn-primary",
              ref: "oods:Button",
              props: { label: "Primary" },
            },
            {
              nodeType: "component",
              id: "btn-secondary",
              ref: "oods:Button",
              props: { label: "Secondary" },
            },
          ],
        },
      },
    });
    expect(setDocResult.saved).toBe(true);
    expect(setDocResult.componentCount).toBe(2);
    usePreviewStateStore
      .getState()
      .setHtml("<button>Primary</button><button>Secondary</button>");

    // Tune phase: /tokens is available and token updates propagate to preview css vars.
    const toTune = usePhaseStore.getState().transitionTo("tune", DEFAULT_PHASES);
    expect(toTune.allowed).toBe(true);
    const tuneTokens = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-3", "/tokens colors.primary=#ff0000 spacing.md=20px")])
    );
    const tuneTool = tuneTokens.content?.find((part) => part.type === "tool-call");
    expect(tuneTool?.type).toBe("tool-call");
    if (tuneTool?.type === "tool-call") {
      expect(tuneTool.toolName).toBe("update_token_state");
    }

    useTokenStateStore.getState().setTokens({
      "colors.primary": "#ff0000",
      "spacing.md": "20px",
    });
    const srcDoc = buildPreviewSrcDoc(
      useTokenStateStore.getState().toCssVariables(),
      usePreviewStateStore.getState().html
    );
    expect(srcDoc).toContain("--colors-primary: #ff0000;");
    expect(srcDoc).toContain("--spacing-md: 20px;");

    // Review phase: /review available.
    const toReview = usePhaseStore.getState().transitionTo("review", DEFAULT_PHASES);
    expect(toReview.allowed).toBe(true);
    const reviewCommand = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-4", "/review approve done")])
    );
    const reviewTool = reviewCommand.content?.find((part) => part.type === "tool-call");
    expect(reviewTool?.type).toBe("tool-call");
    if (reviewTool?.type === "tool-call") {
      expect(reviewTool.toolName).toBe("review_gate");
    }

    // Done phase is review-gated.
    const blockedDone = usePhaseStore.getState().transitionTo("done", DEFAULT_PHASES);
    expect(blockedDone.allowed).toBe(false);
    usePhaseStore.getState().setGateDecision("done", "approved");
    const toDone = usePhaseStore.getState().transitionTo("done", DEFAULT_PHASES);
    expect(toDone.allowed).toBe(true);

    const exportCommand = await runOnce(wrapped, 
      createRunOptions([createUserMessage("u-5", "/export html")])
    );
    const exportTool = exportCommand.content?.find((part) => part.type === "tool-call");
    expect(exportTool?.type).toBe("tool-call");
    if (exportTool?.type === "tool-call") {
      expect(exportTool.toolName).toBe("export_design");
    }

    const htmlExport = executeExportDesign({
      requestId: "export-html-e2e",
      format: "html",
      slug: "s7-e2e",
    });
    expect(htmlExport.exported).toBe(true);
    expect(htmlExport.content).toContain("<button>Primary</button>");
    expect(htmlExport.content).toContain("--colors-primary: #ff0000;");
    expect(htmlExport.content).toContain('<main id="main-content" role="main"');
    expect(htmlExport.content).toContain("@media (max-width: 48rem)");

    const jsonExport = executeExportDesign({
      requestId: "export-json-e2e",
      format: "json",
      slug: "s7-e2e",
    });
    expect(jsonExport.exported).toBe(true);
    const parsedJson = JSON.parse(jsonExport.content);
    expect(parsedJson.document.metadata.title).toBe("Sprint 7 Flow");
    expect(parsedJson.tokenState.colors.primary).toBe("#ff0000");
    expect(parsedJson.exportedAt).toBeDefined();

    const yamlExport = executeExportDesign({
      requestId: "export-yaml-e2e",
      format: "yaml",
      slug: "s7-e2e",
    });
    expect(yamlExport.exported).toBe(true);
    expect(yamlExport.content).toContain("metadata");
    expect(yamlExport.content).toContain("Sprint 7 Flow");

    const cssExport = executeExportDesign({
      requestId: "export-css-e2e",
      format: "css",
      slug: "s7-e2e",
    });
    expect(cssExport.exported).toBe(true);
    expect(cssExport.content).toContain(":root {");
    expect(cssExport.content).toContain("--colors-primary: #ff0000;");

    const scssExport = executeExportDesign({
      requestId: "export-scss-e2e",
      format: "scss",
      slug: "s7-e2e",
    });
    expect(scssExport.exported).toBe(true);
    expect(scssExport.content).toContain("$colors-primary: #ff0000;");

    const specExport = executeExportDesign({
      requestId: "export-spec-e2e",
      format: "spec",
      slug: "s7-e2e",
    });
    expect(specExport.exported).toBe(true);
    const parsedSpec = JSON.parse(specExport.content);
    expect(parsedSpec.componentCount).toBeGreaterThan(0);
    expect(parsedSpec.components[0]?.ref).toContain("oods:");
  });

  it("keeps Foundry tools operational when Stage1 MCP artifact loading fails", async () => {
    const failingStage1Client: Stage1McpClient = {
      listRuns: async () => [],
      getArtifact: async () => {
        throw Object.assign(new Error("Stage1 MCP request failed to connect."), {
          code: "CONNECTION_FAILED",
        });
      },
    };

    const failedRun: Stage1RunSummary = {
      runId: "failed-run",
      hostname: "example.com",
      runDir: "/tmp/does-not-exist",
    };

    await expect(
      buildStage1BundleFromRun(failedRun, failingStage1Client)
    ).rejects.toThrow();

    const schema = {
      version: "2025.11",
      screens: [{ id: "resilience", component: "ArchiveSummary" }],
    };

    const validateResult = await validateSchema({
      requestId: "validate-after-stage1-failure",
      schema,
    });
    expect(validateResult.valid).toBe(true);

    const renderResult = await renderComponent({
      requestId: "render-after-stage1-failure",
      schema,
    });
    expect(renderResult.rendered).toBe(true);
    expect(renderResult.documentSet).toBe(true);
    expect(useDocumentStateStore.getState().document?.root).toMatchObject({
      nodeType: "component",
      ref: "oods:ArchiveSummary",
    });
  });
});
