"use client";

import { makeAssistantToolUI, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { useEffect, useRef } from "react";

import {
  ToolOutputCard,
  ToolOutputCardBody,
  ToolOutputCardCallout,
  ToolOutputCardDescription,
  ToolOutputCardEyebrow,
  ToolOutputCardHeader,
  ToolOutputCardHeading,
  ToolOutputCardMeta,
  ToolOutputCardStatus,
  ToolOutputCardTitle,
} from "@/components/tool-ui/ToolOutputCard";
import {
  COMPONENT_CATALOG_TOOL_NAME,
  type ComponentCatalogToolArgs,
  type ComponentCatalogToolResult,
} from "@/lib/runtime/tools/component-catalog-tool";

const ComponentCatalogToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<ComponentCatalogToolArgs, ComponentCatalogToolResult>) => {
  const execTriggered = useRef(false);
  const resolved = Boolean(result);
  const title = args?.title ?? "Available components";
  const prompt =
    args?.prompt ?? "Browse available OODS components and required props.";
  const components = args?.components ?? [];

  useEffect(() => {
    if (execTriggered.current || resolved || isError || !args) {
      return;
    }
    execTriggered.current = true;
    addResult({
      listed: true,
      source: args.source,
      componentCount: args.componentCount,
      resolvedAt: new Date().toISOString(),
    });
  }, [addResult, args, isError, resolved]);

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Catalog</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={status.type} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>Source: {args?.source ?? "unknown"}</div>
            <div>Components: {args?.componentCount ?? 0}</div>
            {args?.generatedAt ? <div>Generated: {args.generatedAt}</div> : null}
          </div>
        </ToolOutputCardMeta>

        {components.length === 0 ? (
          <ToolOutputCardCallout tone="warning">
            No components available in the catalog.
          </ToolOutputCardCallout>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
            {components.map((component) => (
              <div key={component.id} className="rounded-lg border border-white/10 bg-white/5 p-2">
                <div className="font-medium text-white">{component.name}</div>
                {component.description ? (
                  <div className="mt-1 text-white/70">{component.description}</div>
                ) : null}
                <div className="mt-1 text-white/60">
                  Required props:{" "}
                  {component.requiredProps.length > 0
                    ? component.requiredProps.join(", ")
                    : "none"}
                </div>
                <div className="text-white/60">
                  Traits:{" "}
                  {component.traits.length > 0 ? component.traits.join(", ") : "none"}
                </div>
              </div>
            ))}
          </div>
        )}
      </ToolOutputCardBody>
    </ToolOutputCard>
  );
};

export const ComponentCatalogToolUI = makeAssistantToolUI<
  ComponentCatalogToolArgs,
  ComponentCatalogToolResult
>({
  toolName: COMPONENT_CATALOG_TOOL_NAME,
  render: ComponentCatalogToolCard,
});
