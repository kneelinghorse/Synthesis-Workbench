export type SignalTone = "green" | "yellow" | "red";

export type SignalDefinition = {
  id: SignalTone;
  label: string;
  description?: string;
};

export const SIGNAL_TOOL_NAME = "signal_tool";

export const DEFAULT_SIGNAL_SET: SignalDefinition[] = [
  {
    id: "green",
    label: "Clear",
    description: "Everything looks solid.",
  },
  {
    id: "yellow",
    label: "Caution",
    description: "Keep an eye on the details.",
  },
  {
    id: "red",
    label: "Blocked",
    description: "Needs attention before moving on.",
  },
];

export type SignalToolArgs = {
  title: string;
  prompt?: string;
  requestId: string;
  signals?: SignalDefinition[];
};

export type SignalToolResult = {
  signal: SignalTone;
  note?: string;
  resolvedAt: string;
};
