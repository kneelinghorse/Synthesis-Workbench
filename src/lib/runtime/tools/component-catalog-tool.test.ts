import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeComponentCatalog } from "./component-catalog-tool";

const { getComponentCatalogPromptSectionMock } = vi.hoisted(() => ({
  getComponentCatalogPromptSectionMock: vi.fn(),
}));

vi.mock("@/lib/foundry/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/foundry/catalog")>();
  return {
    ...actual,
    getComponentCatalogPromptSection: getComponentCatalogPromptSectionMock,
  };
});

describe("executeComponentCatalog", () => {
  beforeEach(() => {
    getComponentCatalogPromptSectionMock.mockReset();
  });

  it("uses provided args when catalog metadata is already available", async () => {
    const result = await executeComponentCatalog({
      source: "foundry",
      componentCount: 12,
    });

    expect(result.listed).toBe(true);
    expect(result.source).toBe("foundry");
    expect(result.componentCount).toBe(12);
    expect(getComponentCatalogPromptSectionMock).not.toHaveBeenCalled();
  });

  it("loads snapshot metadata via structuredData-backed prompt section when args are missing", async () => {
    getComponentCatalogPromptSectionMock.mockResolvedValue({
      prompt: "catalog",
      snapshot: {
        source: "fallback",
        fromCache: false,
        fetchedAt: "2026-01-01T00:00:00.000Z",
        catalog: {
          etag: "fallback-etag",
          generatedAt: "2026-01-01T00:00:00.000Z",
          schemaValidated: true,
          componentCount: 5,
          components: [],
        },
      },
    });

    const result = await executeComponentCatalog();

    expect(getComponentCatalogPromptSectionMock).toHaveBeenCalledWith({ limit: 120 });
    expect(result.listed).toBe(true);
    expect(result.source).toBe("fallback");
    expect(result.componentCount).toBe(5);
  });
});
