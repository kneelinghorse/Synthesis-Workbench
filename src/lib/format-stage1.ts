export const formatRunId = (runId: string) =>
  runId.length > 16
    ? `${runId.slice(0, 8)}\u2026${runId.slice(-4)}`
    : runId;

export const formatTimestamp = (value?: string) => {
  if (!value) return "Unknown time";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

export const formatMode = (mode?: string): string | null => {
  if (!mode) return null;
  const lower = mode.toLowerCase();
  if (lower === "surface") return "Surface";
  if (lower === "app") return "App";
  if (lower === "suite") return "Suite";
  return mode.charAt(0).toUpperCase() + mode.slice(1);
};

const BADGE_LABELS: Record<string, string> = {
  token_guess: "Tokens",
  component_clusters: "Components",
  style_fingerprint: "Fingerprint",
};

export const formatArtifactBadge = (type: string): string =>
  BADGE_LABELS[type] ?? type;
