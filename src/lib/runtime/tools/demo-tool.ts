export const DEMO_TOOL_NAME = "demo_tool";

export type DemoToolArgs = {
  title: string;
  description?: string;
  requestId: string;
};

export type DemoToolResult = {
  acknowledged: boolean;
  notes: string;
  resolvedAt: string;
};
