import type { ComponentCatalogSource } from "@/lib/foundry/catalog";
import { getComponentCatalogPromptSection } from "@/lib/foundry/catalog";

export const COMPONENT_CATALOG_TOOL_NAME = "component_catalog";

export type ComponentCatalogToolEntry = {
  id: string;
  name: string;
  description?: string;
  requiredProps: string[];
  traits: string[];
  variants: string[];
};

export type ComponentCatalogToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  source: ComponentCatalogSource;
  generatedAt?: string | null;
  componentCount: number;
  components: ComponentCatalogToolEntry[];
};

export type ComponentCatalogToolResult = {
  listed: boolean;
  source: ComponentCatalogSource;
  componentCount: number;
  resolvedAt: string;
};

export const executeComponentCatalog = async (
  args?: Partial<ComponentCatalogToolArgs>
): Promise<ComponentCatalogToolResult> => {
  if (args?.source && typeof args.componentCount === "number") {
    return {
      listed: true,
      source: args.source,
      componentCount: args.componentCount,
      resolvedAt: new Date().toISOString(),
    };
  }

  const { snapshot } = await getComponentCatalogPromptSection({ limit: 120 });
  return {
    listed: true,
    source: snapshot.source,
    componentCount: snapshot.catalog.componentCount,
    resolvedAt: new Date().toISOString(),
  };
};
