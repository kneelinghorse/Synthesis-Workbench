import { describe, expect, it, vi } from "vitest";

import { normalizeFoundryComponentCatalog } from "../src/lib/foundry/catalog";
import { renderDocument } from "../src/lib/engine/composition-renderer";
import type {
  FoundryMcpClient,
  FoundryRenderOutput,
} from "../src/lib/mcp/foundry-client";
import type { DesignDocument } from "../src/types/document-model";

const catalog = normalizeFoundryComponentCatalog({
  dataset: "components",
  version: "2026-02-01",
  generatedAt: "2026-02-01T00:00:00Z",
  etag: "catalog-layout-test",
  matched: false,
  payloadIncluded: true,
  path: "cmos/planning/oods-components.json",
  manifestPath: null,
  sizeBytes: 1024,
  schemaValidated: true,
  payload: {
    components: [
      {
        id: "ArchiveSummary",
        displayName: "ArchiveSummary",
        contexts: ["detail"],
        regions: ["card"],
        traitUsages: [],
      },
      {
        id: "RetentionChart",
        displayName: "RetentionChart",
        contexts: ["dashboard"],
        regions: ["panel"],
        traitUsages: [],
      },
      {
        id: "LifecycleBadge",
        displayName: "LifecycleBadge",
        contexts: ["list"],
        regions: ["inline"],
        traitUsages: [],
      },
    ],
  },
  raw: {},
});

if (!catalog || catalog.components.length < 3) {
  throw new Error("Catalog fixture did not produce at least three components.");
}

const componentNames = catalog.components.slice(0, 3).map((c) => c.name);

const createDoc = (layout: "stack" | "grid"): DesignDocument => ({
  metadata: { title: `Catalog ${layout}` },
  root: {
    nodeType: "layout",
    layout:
      layout === "stack"
        ? { type: "stack", gap: 16 }
        : { type: "grid", columns: 3, gap: 16 },
    children: componentNames.map((name, index) => ({
      nodeType: "component",
      id: `${name}-${index}`,
      ref: `oods:${name}`,
      props: { label: `${name} ${index + 1}` },
    })),
  },
});

const createClient = (
  renderImpl?: (schema: unknown) => Promise<FoundryRenderOutput>
): FoundryMcpClient => ({
  render:
    renderImpl ??
    vi.fn(async (schema: unknown) => {
      const s = schema as { component?: string };
      const component = s.component ?? "Unknown";
      return {
        html: `<section data-rendered="${component}">${component} rendered</section>`,
        warnings: [],
        raw: schema,
      };
    }),
  validate: vi.fn(async () => ({ errors: [], warnings: [], valid: true, raw: null })),
  buildTokens: vi.fn(async () => ({ raw: null })),
  fetchStructuredData: vi.fn(),
});

describe("composition renderer with Foundry catalog component names", () => {
  it("renders 3+ catalog components in stack layout", async () => {
    const client = createClient();
    const result = await renderDocument(createDoc("stack"), client);

    expect(client.render).toHaveBeenCalledTimes(3);
    expect(result.errors).toEqual([]);
    expect(result.components).toHaveLength(3);
    expect(result.html).toContain('data-layout="stack"');
    for (const name of componentNames) {
      expect(result.html).toContain(`${name} rendered`);
      expect(client.render).toHaveBeenCalledWith(
        expect.objectContaining({ component: name })
      );
    }
  });

  it("renders 3+ catalog components in grid layout", async () => {
    const client = createClient();
    const result = await renderDocument(createDoc("grid"), client);

    expect(client.render).toHaveBeenCalledTimes(3);
    expect(result.errors).toEqual([]);
    expect(result.components).toHaveLength(3);
    expect(result.html).toContain('data-layout="grid"');
    expect(result.html).toContain("repeat(3, 1fr)");
    for (const name of componentNames) {
      expect(result.html).toContain(`${name} rendered`);
    }
  });

  it("dispatches catalog component renders in parallel", async () => {
    const resolverMap = new Map<string, () => void>();
    const startOrder: string[] = [];

    const client = createClient(
      vi.fn((schema: unknown) => {
        const s = schema as { component?: string };
        const component = s.component ?? "Unknown";
        startOrder.push(component);

        return new Promise<FoundryRenderOutput>((resolve) => {
          resolverMap.set(component, () =>
            resolve({
              html: `<div>${component} rendered</div>`,
              warnings: [],
              raw: schema,
            })
          );
        });
      })
    );

    const renderPromise = renderDocument(createDoc("grid"), client);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(resolverMap.size).toBe(3);
    expect(startOrder.sort()).toEqual([...componentNames].sort());

    // Resolve out of order to prove independent in-flight renders.
    resolverMap.get(componentNames[2])?.();
    resolverMap.get(componentNames[0])?.();
    resolverMap.get(componentNames[1])?.();

    const result = await renderPromise;
    expect(result.errors).toEqual([]);
    for (const name of componentNames) {
      expect(result.html).toContain(`${name} rendered`);
    }
  });
});
