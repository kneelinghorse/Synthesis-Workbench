import { getFoundryMcpClient } from "@/lib/mcp/foundry-client";
import { formatMcpServiceError } from "@/lib/mcp/user-facing-errors";

export const VALIDATE_SCHEMA_TOOL_NAME = "validate_schema";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type ValidateSchemaToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  schema?: Record<string, unknown>;
};

export type ValidateSchemaToolResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  resolvedAt: string;
};

export const validateSchema = async (
  args: ValidateSchemaToolArgs
): Promise<ValidateSchemaToolResult> => {
  try {
    const client = getFoundryMcpClient();
    const result = await client.validate(args.schema);

    return {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      resolvedAt: new Date().toISOString(),
    };
  } catch (error) {
    const formatted = formatMcpServiceError("foundry", error, {
      operation: "validating the schema",
    });
    const errors = [formatted];
    const code = isRecord(error) && typeof error.code === "string" ? error.code : undefined;
    if (!code) {
      const raw = error instanceof Error ? error.message : String(error);
      const trimmed = raw.trim();
      if (trimmed) {
        errors.push(trimmed);
      }
    }
    return {
      valid: false,
      errors,
      warnings: [],
      resolvedAt: new Date().toISOString(),
    };
  }
};
