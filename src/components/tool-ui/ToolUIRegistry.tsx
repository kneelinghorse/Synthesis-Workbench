"use client";

import { RenderComponentToolUI } from "./RenderComponentToolUI";
import { Stage1BundleToolUI } from "./Stage1BundleTool";
import { TokenAdjustmentToolUI } from "./TokenAdjustmentToolUI";
import { FoundryTokenSyncToolUI } from "./FoundryTokenSyncToolUI";
import { SetDocumentToolUI, PatchNodeToolUI } from "./DocumentToolUI";
import { SetDataContextToolUI } from "./SetDataContextToolUI";
import { ValidateSchemaToolUI } from "./ValidateSchemaToolUI";
import { ComponentCatalogToolUI } from "./ComponentCatalogToolUI";
import { InspectAppToolUI } from "./InspectAppToolUI";
import { InspectSurfaceToolUI } from "./InspectSurfaceToolUI";
import { ToolErrorBoundary } from "./ToolErrorBoundary";

// Add new tool UI registrations here so they are available in the chat runtime.
export const ToolUIRegistry = () => (
  <>
    <ToolErrorBoundary>
      <RenderComponentToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <ValidateSchemaToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <Stage1BundleToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <TokenAdjustmentToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <FoundryTokenSyncToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <SetDocumentToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <PatchNodeToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <SetDataContextToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <ComponentCatalogToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <InspectAppToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <InspectSurfaceToolUI />
    </ToolErrorBoundary>
  </>
);
