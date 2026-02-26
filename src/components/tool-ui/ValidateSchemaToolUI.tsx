"use client";

import {
  makeAssistantToolUI,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { useEffect, useRef, useState } from "react";

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
import { getFoundryMcpClient } from "@/lib/mcp/foundry-client";
import { formatMcpServiceError } from "@/lib/mcp/user-facing-errors";
import {
  VALIDATE_SCHEMA_TOOL_NAME,
  type ValidateSchemaToolArgs,
  type ValidateSchemaToolResult,
} from "@/lib/runtime/tools/validate-tools";

const ValidateSchemaToolCard = ({
  args,
  result,
  status,
  isError,
  addResult,
}: ToolCallMessagePartProps<
  ValidateSchemaToolArgs,
  ValidateSchemaToolResult
>) => {
  const [validating, setValidating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const validateTriggered = useRef(false);

  const resolved = Boolean(result);
  const schema = args?.schema;

  const requestId = args?.requestId ?? "unknown";
  const title = args?.title ?? "Schema validation";
  const prompt =
    args?.prompt ?? "Validate a component schema via Foundry MCP.";

  useEffect(() => {
    if (validateTriggered.current || resolved || isError) return;
    if (!schema) return;

    const run = async () => {
      setValidating(true);
      setLocalError(null);

      try {
        const output = await getFoundryMcpClient().validate(schema);
        addResult({
          valid: output.valid,
          errors: output.errors,
          warnings: output.warnings,
          resolvedAt: new Date().toISOString(),
        });
      } catch (error) {
        const message = formatMcpServiceError("foundry", error, {
          operation: "validating the schema",
        });
        setLocalError(message);
        addResult({
          valid: false,
          errors: [message],
          warnings: [],
          resolvedAt: new Date().toISOString(),
        });
      } finally {
        setValidating(false);
        validateTriggered.current = true;
      }
    };

    void run();
  }, [addResult, isError, resolved, schema]);

  const errors = result?.errors ?? (localError ? [localError] : []);
  const warnings = result?.warnings ?? [];
  const isValid = result?.valid ?? false;

  return (
    <ToolOutputCard>
      <ToolOutputCardHeader>
        <ToolOutputCardHeading>
          <ToolOutputCardEyebrow>Schema Validation</ToolOutputCardEyebrow>
          <ToolOutputCardTitle>{title}</ToolOutputCardTitle>
          <ToolOutputCardDescription>{prompt}</ToolOutputCardDescription>
        </ToolOutputCardHeading>
        <ToolOutputCardStatus status={status.type} />
      </ToolOutputCardHeader>

      <ToolOutputCardBody>
        <ToolOutputCardMeta>
          <div className="space-y-1">
            <div>Request ID: {requestId}</div>
            <div>
              Status:{" "}
              {validating
                ? "Validating"
                : resolved
                  ? isValid
                    ? "Pass"
                    : "Fail"
                  : "Ready"}
            </div>
            <div>Errors: {errors.length}</div>
            <div>Warnings: {warnings.length}</div>
          </div>
        </ToolOutputCardMeta>

        {isError ? (
          <ToolOutputCardCallout tone="danger">
            Tool error reported.
          </ToolOutputCardCallout>
        ) : null}

        {resolved && isValid && errors.length === 0 ? (
          <ToolOutputCardCallout tone="success" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-100/70">
              Validation passed
            </div>
            <div className="text-sm font-medium text-emerald-50">
              Schema is valid. No errors detected.
            </div>
          </ToolOutputCardCallout>
        ) : null}

        {errors.length > 0 ? (
          <ToolOutputCardCallout tone="danger" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-red-100/70">
              Validation failed
            </div>
            <div className="space-y-1 text-sm text-red-50">
              {errors.map((error, index) => (
                <div key={`err-${index}`}>{error}</div>
              ))}
            </div>
          </ToolOutputCardCallout>
        ) : null}

        {warnings.length > 0 ? (
          <ToolOutputCardCallout tone="warning" className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-amber-100/70">
              Warnings
            </div>
            <div className="space-y-1 text-xs text-amber-100/70">
              {warnings.map((warning, index) => (
                <div key={`warn-${index}`}>{warning}</div>
              ))}
            </div>
          </ToolOutputCardCallout>
        ) : null}

        {!schema ? (
          <ToolOutputCardCallout tone="warning">
            No schema provided. Pass a JSON schema after <code>/validate</code>{" "}
            to check validity.
          </ToolOutputCardCallout>
        ) : null}
      </ToolOutputCardBody>
    </ToolOutputCard>
  );
};

export const ValidateSchemaToolUI = makeAssistantToolUI<
  ValidateSchemaToolArgs,
  ValidateSchemaToolResult
>({
  toolName: VALIDATE_SCHEMA_TOOL_NAME,
  render: ValidateSchemaToolCard,
});
