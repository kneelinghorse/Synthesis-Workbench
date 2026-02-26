"use client";

import { DemoToolUI } from "./DemoTool";
import { PhaseTransitionToolUI } from "./PhaseTransitionTool";
import { ReviewGateToolUI } from "./ReviewGateTool";
import { RenderComponentToolUI } from "./RenderComponentToolUI";
import { SignalToolUI } from "./SignalTool";
import { Stage1BundleToolUI } from "./Stage1BundleTool";
import { TokenAdjustmentToolUI } from "./TokenAdjustmentToolUI";
import { FoundryTokenSyncToolUI } from "./FoundryTokenSyncToolUI";
import { SetDocumentToolUI, PatchNodeToolUI } from "./DocumentToolUI";
import { SetDataContextToolUI } from "./SetDataContextToolUI";
import { ValidateSchemaToolUI } from "./ValidateSchemaToolUI";
import { ExportDesignToolUI } from "./ExportDesignToolUI";
import { ComponentCatalogToolUI } from "./ComponentCatalogToolUI";
import { ToolErrorBoundary } from "./ToolErrorBoundary";

// Add new tool UI registrations here so they are available in the chat runtime.
export const ToolUIRegistry = () => (
  <>
    <ToolErrorBoundary>
      <DemoToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <PhaseTransitionToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <ReviewGateToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <RenderComponentToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <ValidateSchemaToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <ExportDesignToolUI />
    </ToolErrorBoundary>
    <ToolErrorBoundary>
      <SignalToolUI />
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
  </>
);
