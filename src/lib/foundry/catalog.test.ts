import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchStructuredDataMock = vi.fn();

vi.mock("@/lib/mcp/foundry-client", () => ({
  createFoundryMcpClient: vi.fn(() => ({
    fetchStructuredData: fetchStructuredDataMock,
  })),
}));

import {
  getComponentCatalogSnapshot,
  getFallbackComponentCatalog,
  formatFoundryCatalogForPrompt,
  normalizeFoundryComponentCatalog,
  resetComponentCatalogCache,
} from "./catalog";

beforeEach(() => {
  fetchStructuredDataMock.mockReset();
  resetComponentCatalogCache();
});

describe("normalizeFoundryComponentCatalog", () => {
  it("extracts traits, required props, and variants from structured data payload", () => {
    const catalog = normalizeFoundryComponentCatalog({
      dataset: "components",
      version: "2025-12-19",
      generatedAt: "2025-12-19T00:00:00Z",
      etag: "abc123",
      matched: false,
      payloadIncluded: true,
      path: "cmos/planning/oods-components.json",
      manifestPath: null,
      sizeBytes: 100,
      schemaValidated: true,
      payload: {
        components: [
          {
            id: "ArchiveSummary",
            displayName: "ArchiveSummary",
            categories: ["lifecycle"],
            contexts: ["detail"],
            regions: ["card", "detail"],
            traitUsages: [
              {
                trait: "Archivable",
                context: "detail",
                props: {
                  archivedAtField: "archived_at",
                  reasonField: "archive_reason",
                },
              },
            ],
          },
        ],
      },
      raw: {},
    });

    expect(catalog).not.toBeNull();
    expect(catalog?.componentCount).toBe(1);
    expect(catalog?.components[0]?.name).toBe("ArchiveSummary");
    expect(catalog?.components[0]?.traits).toEqual(["Archivable"]);
    expect(catalog?.components[0]?.requiredProps).toEqual([
      "archivedAtField",
      "reasonField",
    ]);
    expect(catalog?.components[0]?.variants).toEqual(["card", "detail"]);
  });

  it("returns null when payload is missing", () => {
    const catalog = normalizeFoundryComponentCatalog({
      dataset: "components",
      version: null,
      generatedAt: null,
      etag: "abc123",
      matched: false,
      payloadIncluded: false,
      path: "cmos/planning/oods-components.json",
      manifestPath: null,
      sizeBytes: 100,
      schemaValidated: false,
      raw: {},
    });

    expect(catalog).toBeNull();
  });
});

describe("formatFoundryCatalogForPrompt", () => {
  it("formats a concise prompt section with required props, variants, and traits", () => {
    const prompt = formatFoundryCatalogForPrompt(
      {
        etag: "abc123",
        generatedAt: "2025-12-19T00:00:00Z",
        schemaValidated: true,
        componentCount: 1,
        components: [
          {
            id: "ArchiveSummary",
            name: "ArchiveSummary",
            categories: ["lifecycle"],
            tags: ["retention"],
            variants: ["card", "detail"],
            traits: ["Archivable"],
            requiredProps: ["archivedAtField", "reasonField"],
            traitUsages: [
              {
                trait: "Archivable",
                context: "detail",
                props: ["archivedAtField", "reasonField"],
              },
            ],
          },
        ],
      },
      { limit: 10 }
    );

    expect(prompt).toContain("OODS COMPONENT CATALOG (FOUNDRY)");
    expect(prompt).toContain("oods:ArchiveSummary");
    expect(prompt).toContain("traits: Archivable");
    expect(prompt).toContain("required props: archivedAtField, reasonField");
    expect(prompt).toContain("variants: card, detail");
  });

  it("can restrict prompt guidance to the Workbench S44 component set", () => {
    const prompt = formatFoundryCatalogForPrompt(
      {
        etag: "abc123",
        generatedAt: "2025-12-19T00:00:00Z",
        schemaValidated: true,
        componentCount: 2,
        components: [
          {
            id: "ArchiveSummary",
            name: "ArchiveSummary",
            categories: ["lifecycle"],
            tags: ["retention"],
            variants: ["detail"],
            traits: ["Archivable"],
            requiredProps: ["archivedAtField"],
            traitUsages: [],
          },
          {
            id: "Button",
            name: "Button",
            categories: ["core"],
            tags: ["action"],
            variants: ["default"],
            traits: ["Actionable"],
            requiredProps: ["label"],
            traitUsages: [],
          },
        ],
      },
      { limit: 10, workbenchOnly: true }
    );

    expect(prompt).toContain("oods:Button");
    expect(prompt).not.toContain("oods:ArchiveSummary");
    expect(prompt).toContain("Workbench composition constraint");
  });
});

describe("getComponentCatalogSnapshot", () => {
  it("uses fallback catalog when Foundry is unavailable", async () => {
    fetchStructuredDataMock.mockRejectedValueOnce(new Error("offline"));

    const snapshot = await getComponentCatalogSnapshot({
      forceRefresh: true,
      nowMs: 1_000,
    });

    expect(snapshot.source).toBe("fallback");
    expect(snapshot.fromCache).toBe(false);
    expect(snapshot.catalog.componentCount).toBeGreaterThan(0);
  });

  it("reuses catalog from cache within TTL", async () => {
    fetchStructuredDataMock.mockResolvedValueOnce({
      dataset: "components",
      version: "2026-01-01",
      generatedAt: "2026-01-01T00:00:00Z",
      etag: "etag-1",
      matched: true,
      payloadIncluded: true,
      path: "catalog.json",
      manifestPath: null,
      sizeBytes: 10,
      schemaValidated: true,
      payload: {
        components: [
          {
            id: "Text",
            displayName: "Text",
            requiredProps: ["text"],
          },
        ],
      },
      raw: {},
    });

    const first = await getComponentCatalogSnapshot({
      forceRefresh: true,
      nowMs: 1_000,
      ttlMs: 300_000,
    });
    const second = await getComponentCatalogSnapshot({
      nowMs: 2_000,
      ttlMs: 300_000,
    });

    expect(first.source).toBe("foundry");
    expect(second.source).toBe("foundry");
    expect(second.fromCache).toBe(true);
    expect(fetchStructuredDataMock).toHaveBeenCalledTimes(1);
  });

  it("fallback catalog includes built-in template components", () => {
    const fallback = getFallbackComponentCatalog();
    const componentNames = fallback.components.map((component) => component.name);

    expect(componentNames).toContain("Button");
    expect(componentNames).toContain("Card");
    expect(componentNames).toContain("Tabs");
    expect(componentNames).not.toContain("DetailHeader");
  });
});
