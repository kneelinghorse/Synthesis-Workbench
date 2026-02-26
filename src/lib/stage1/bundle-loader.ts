import {
  getStage1McpClient,
  type Stage1McpClient,
  type Stage1RunSummary,
} from "@/lib/mcp/stage1-client";
import type {
  Stage1BundleArtifactPayload,
  Stage1BundlePayload,
  Stage1Manifest,
} from "@/types/stage1-bundle";

type Stage1ReportIndexArtifact = {
  type?: string;
  path?: string;
  name?: string;
  kind?: string;
  role?: string;
  id?: string;
};

type Stage1ReportIndexTarget = {
  target_id?: string;
  id?: string;
  name?: string;
  url?: string;
  artifacts?: Stage1ReportIndexArtifact[] | unknown;
};

type Stage1ReportIndex = {
  kind?: string;
  version?: string;
  mode?: string;
  artifacts?: Stage1ReportIndexArtifact[] | unknown;
  targets?: Stage1ReportIndexTarget[] | unknown;
};

const KNOWN_ARTIFACT_TYPES = new Set([
  "style_fingerprint",
  "token_guess",
  "component_clusters",
]);

const ARTIFACT_MATCHER =
  /style[_-]?fingerprint|token[_-]?guess|component|cluster/i;

const toStringValue = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const resolveArtifactLabel = (artifact: Stage1ReportIndexArtifact) =>
  [
    artifact.type,
    artifact.path,
    artifact.name,
    artifact.kind,
    artifact.role,
    artifact.id,
  ]
    .map((value) => toStringValue(value)?.toLowerCase())
    .filter((value): value is string => Boolean(value))
    .join(" ");

const extractArtifactPath = (artifact: Stage1ReportIndexArtifact) =>
  toStringValue(artifact.path) ??
  toStringValue(artifact.name) ??
  toStringValue(artifact.id) ??
  toStringValue(artifact.type);

const isMissingArtifactError = (error: unknown) => {
  if (error instanceof Error) {
    return /not found|missing/i.test(error.message);
  }
  if (typeof error === "string") {
    return /not found|missing/i.test(error);
  }
  if (isRecord(error)) {
    const details = [
      toStringValue(error.message),
      toStringValue(error.error),
      toStringValue(error.detail),
      toStringValue(error.reason),
      isRecord(error.error) ? toStringValue(error.error.message) : undefined,
    ];

    return details.some((detail) => Boolean(detail?.match(/not found|missing/i)));
  }
  return false;
};

const toArtifactArray = (value: unknown): Stage1ReportIndexArtifact[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is Stage1ReportIndexArtifact => isRecord(entry));
};

const toTargetArray = (value: unknown): Stage1ReportIndexTarget[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is Stage1ReportIndexTarget => isRecord(entry));
};

const normalizeTargetIdentifier = (value: string | undefined) => {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let hostLike = trimmed;

  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      hostLike = new URL(trimmed).hostname;
    }
  } catch {
    hostLike = trimmed;
  }

  const noPath = hostLike.split("/")[0] ?? hostLike;
  const lowered = noPath.toLowerCase();
  return lowered.startsWith("www.") ? lowered.slice(4) : lowered;
};

const targetMatchesHostname = (
  target: Stage1ReportIndexTarget,
  targetHostname: string | undefined
) => {
  const normalizedHostname = normalizeTargetIdentifier(targetHostname);
  if (!normalizedHostname) {
    return false;
  }

  const candidates = [target.target_id, target.id, target.name, target.url]
    .map((value) => normalizeTargetIdentifier(toStringValue(value)))
    .filter((value): value is string => Boolean(value));

  return candidates.some((candidate) => candidate === normalizedHostname);
};

const resolveManifestProjectId = (manifest: Stage1Manifest): string | undefined =>
  toStringValue(manifest.projectId) ??
  toStringValue(manifest.project_id);

const fetchManifest = async (
  run: Stage1RunSummary,
  client: Stage1McpClient
): Promise<Stage1Manifest> => {
  if (!run.runDir) {
    return {};
  }

  const candidates = ["manifest.json", "../manifest.json"];

  for (const candidate of candidates) {
    try {
      const manifest = await client.getArtifact<unknown>(run.runDir, candidate);
      if (isRecord(manifest)) {
        return manifest as Stage1Manifest;
      }
    } catch (error) {
      if (isMissingArtifactError(error)) {
        continue;
      }
      throw error;
    }
  }

  return {};
};

const collectReportArtifacts = (
  reportIndex: Stage1ReportIndex | null,
  targetHostname: string | undefined
): Stage1ReportIndexArtifact[] => {
  const topLevel = toArtifactArray(reportIndex?.artifacts);
  const targets = toTargetArray(reportIndex?.targets);

  if (targets.length === 0) {
    return topLevel;
  }

  const matchedTarget = targetHostname
    ? targets.find((target) => targetMatchesHostname(target, targetHostname))
    : undefined;

  const targetArtifacts = toArtifactArray(matchedTarget?.artifacts);
  return [...topLevel, ...targetArtifacts];
};

const resolveRelevantArtifacts = (
  reportArtifacts: Stage1ReportIndexArtifact[]
): Stage1ReportIndexArtifact[] => {
  if (reportArtifacts.length === 0) {
    return [];
  }

  const typeMatched = reportArtifacts.filter(
    (a) => KNOWN_ARTIFACT_TYPES.has(toStringValue(a.type)?.toLowerCase() ?? "")
  );

  if (typeMatched.length > 0) {
    return typeMatched;
  }

  return reportArtifacts.filter((a) =>
    ARTIFACT_MATCHER.test(resolveArtifactLabel(a))
  );
};

const fetchArtifactPayloads = async (
  runDir: string,
  artifacts: Stage1ReportIndexArtifact[],
  client: Stage1McpClient
): Promise<Stage1BundleArtifactPayload[]> => {
  const results: Stage1BundleArtifactPayload[] = [];

  for (const artifact of artifacts) {
    const path = extractArtifactPath(artifact);
    if (!path) continue;

    try {
      const payload = await client.getArtifact(runDir, path);
      const artifactType = toStringValue(artifact.type);
      results.push({
        id: toStringValue(artifact.id),
        path,
        type: artifactType ? artifactType.toLowerCase() : undefined,
        name: toStringValue(artifact.name),
        kind: toStringValue(artifact.kind),
        role: toStringValue(artifact.role),
        payload,
      });
    } catch (error) {
      if (isMissingArtifactError(error)) {
        continue;
      }
      throw error;
    }
  }

  return results;
};

const buildBundleArtifacts = async (
  runDir: string,
  reportIndex: Stage1ReportIndex | null,
  targetHostname: string | undefined,
  client: Stage1McpClient
) => {
  const reportArtifacts = collectReportArtifacts(reportIndex, targetHostname);
  const relevant = resolveRelevantArtifacts(reportArtifacts);
  const artifacts = await fetchArtifactPayloads(runDir, relevant, client);

  if (artifacts.length > 0) {
    return artifacts;
  }

  const fallbackPaths = [
    "style_fingerprint.json",
    "style-fingerprint.json",
    "component_clusters.json",
    "component-clusters.json",
    "token-guess.json",
    "token_guess.json",
  ];

  const fallbackResults: Stage1BundleArtifactPayload[] = [];

  for (const path of fallbackPaths) {
    try {
      const payload = await client.getArtifact(runDir, path);
      fallbackResults.push({ path, type: path, payload });
    } catch (error) {
      if (isMissingArtifactError(error)) {
        continue;
      }
      throw error;
    }
  }

  return fallbackResults;
};

const fetchReportIndex = async (
  runDir: string,
  client: Stage1McpClient
): Promise<Stage1ReportIndex | null> => {
  const candidates = [
    "report-index.json",
    "report_index.json",
    "artifacts/report-index.json",
  ];

  for (const candidate of candidates) {
    try {
      const reportIndex = await client.getArtifact<unknown>(runDir, candidate);
      if (isRecord(reportIndex)) {
        return reportIndex as Stage1ReportIndex;
      }
    } catch (error) {
      if (isMissingArtifactError(error)) {
        continue;
      }
      throw error;
    }
  }

  return null;
};

export const buildStage1BundleFromRun = async (
  run: Stage1RunSummary,
  client: Stage1McpClient = getStage1McpClient()
): Promise<Stage1BundlePayload> => {
  if (!run.runDir) {
    throw new Error("Selected run is missing a run directory.");
  }

  const manifest = await fetchManifest(run, client);
  const reportIndex = await fetchReportIndex(run.runDir, client);
  const artifacts = await buildBundleArtifacts(
    run.runDir,
    reportIndex,
    run.hostname,
    client
  );

  if (!manifest.generatedAt && run.timestamp) {
    manifest.generatedAt = run.timestamp;
  }
  if (!manifest.mode && run.mode) {
    manifest.mode = run.mode;
  }
  if (!Array.isArray(manifest.targets) && run.hostname) {
    manifest.targets = [{ id: run.hostname, name: run.hostname }];
  }
  if (!manifest.projectId && !manifest.project_id && run.projectId) {
    manifest.projectId = run.projectId;
  }

  const projectId = resolveManifestProjectId(manifest);
  if (projectId && !manifest.projectId) {
    manifest.projectId = projectId;
  }

  return {
    manifest,
    artifacts: artifacts.length ? artifacts : undefined,
  };
};
