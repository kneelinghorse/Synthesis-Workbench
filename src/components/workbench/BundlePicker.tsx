"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ToolOutputCardCallout } from "@/components/tool-ui/ToolOutputCard";
import {
  formatArtifactBadge,
  formatMode,
  formatRunId,
  formatTimestamp,
} from "@/lib/format-stage1";
import {
  getStage1McpClient,
  type Stage1McpClient,
  type Stage1RunSummary,
} from "@/lib/mcp/stage1-client";
import { formatMcpServiceError } from "@/lib/mcp/user-facing-errors";
import { cn } from "@/lib/utils";

type BundlePickerProps = {
  onSelect: (run: Stage1RunSummary) => void;
  selectedRunId?: string | null;
  associatedRunId?: string | null;
  busy?: boolean;
};

type ArtifactMeta = {
  types: string[];
};

export const ALL_PROJECTS = "__all__";
export const UNLINKED = "__unlinked__";

const KNOWN_BADGE_TYPES = new Set([
  "token_guess",
  "component_clusters",
  "style_fingerprint",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const sortRuns = (runs: Stage1RunSummary[]) =>
  [...runs].sort((left, right) => {
    const leftTime = left.timestamp ? Date.parse(left.timestamp) : 0;
    const rightTime = right.timestamp ? Date.parse(right.timestamp) : 0;
    return rightTime - leftTime;
  });

export const groupRunsForDisplay = (
  runs: Stage1RunSummary[],
  filter: string,
  projectFilter: string
): Array<[string, Stage1RunSummary[]]> => {
  const normalizedFilter = filter.trim().toLowerCase();

  const filtered = runs.filter((run) => {
    if (normalizedFilter) {
      const searchable = [run.hostname, run.projectId ?? "", run.runId]
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(normalizedFilter)) return false;
    }

    if (projectFilter !== ALL_PROJECTS) {
      if (projectFilter === UNLINKED) {
        if (run.projectId) return false;
      } else if (run.projectId !== projectFilter) {
        return false;
      }
    }

    return true;
  });

  const grouped = sortRuns(filtered).reduce<Record<string, Stage1RunSummary[]>>(
    (acc, run) => {
      const key = run.hostname || "unknown";
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(run);
      return acc;
    },
    {}
  );

  return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
};

export const getRunActionLabel = (
  isSelected: boolean,
  isAssociated: boolean
) => {
  if (isSelected) return "Selected";
  if (isAssociated) return "Linked";
  return "Load";
};

const fetchArtifactMeta = async (
  run: Stage1RunSummary,
  client: Stage1McpClient
): Promise<ArtifactMeta | null> => {
  if (!run.runDir) return null;

  const candidates = [
    "report-index.json",
    "report_index.json",
    "artifacts/report-index.json",
  ];

  for (const candidate of candidates) {
    try {
      const index = await client.getArtifact<{
        artifacts?: Array<{ type?: string }>;
        targets?: Array<{ artifacts?: Array<{ type?: string }> }>;
      }>(run.runDir, candidate);

      if (!isRecord(index)) {
        continue;
      }

      const types = new Set<string>();

      if (Array.isArray(index.artifacts)) {
        for (const a of index.artifacts) {
          if (a.type && KNOWN_BADGE_TYPES.has(a.type)) {
            types.add(a.type);
          }
        }
      }

      if (Array.isArray(index.targets)) {
        for (const target of index.targets) {
          if (Array.isArray(target.artifacts)) {
            for (const a of target.artifacts) {
              if (a.type && KNOWN_BADGE_TYPES.has(a.type)) {
                types.add(a.type);
              }
            }
          }
        }
      }

      return { types: Array.from(types) };
    } catch {
      continue;
    }
  }

  return null;
};

const ArtifactBadge = ({ type }: { type: string }) => {
  const colorMap: Record<string, string> = {
    token_guess: "bg-amber-500/20 text-amber-200/90 border-amber-500/30",
    component_clusters:
      "bg-violet-500/20 text-violet-200/90 border-violet-500/30",
    style_fingerprint: "bg-cyan-500/20 text-cyan-200/90 border-cyan-500/30",
  };

  return (
    <span
      className={cn(
        "inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-tight",
        colorMap[type] ?? "bg-white/10 text-white/60 border-white/20"
      )}
    >
      {formatArtifactBadge(type)}
    </span>
  );
};

export const BundlePicker = ({
  onSelect,
  selectedRunId,
  associatedRunId,
  busy = false,
}: BundlePickerProps) => {
  const [runs, setRuns] = useState<Stage1RunSummary[]>([]);
  const [filter, setFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifactMap, setArtifactMap] = useState<Map<string, ArtifactMeta>>(
    new Map()
  );

  const refreshRuns = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const client = getStage1McpClient();
      const response = await client.listRuns();
      setRuns(response);

      const metaResults = await Promise.allSettled(
        response.map(async (run) => {
          const meta = await fetchArtifactMeta(run, client);
          return { runId: run.runId, meta };
        })
      );

      const newMap = new Map<string, ArtifactMeta>();
      for (const result of metaResults) {
        if (result.status === "fulfilled" && result.value.meta) {
          newMap.set(result.value.runId, result.value.meta);
        }
      }
      setArtifactMap(newMap);
    } catch (err) {
      setError(
        formatMcpServiceError("stage1", err, {
          operation: "loading available Stage1 runs",
        })
      );
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  const uniqueProjects = useMemo(() => {
    const projects = new Set<string>();
    let hasUnlinked = false;
    for (const run of runs) {
      if (run.projectId) {
        projects.add(run.projectId);
      } else {
        hasUnlinked = true;
      }
    }
    return { ids: Array.from(projects).sort(), hasUnlinked };
  }, [runs]);

  const groupedRuns = useMemo(
    () => groupRunsForDisplay(runs, filter, projectFilter),
    [filter, projectFilter, runs]
  );

  const showProjectFilter =
    uniqueProjects.ids.length > 0 || uniqueProjects.hasUnlinked;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-white/50">
            Stage1 Bundle Picker
          </div>
          <div className="mt-1 text-sm text-white/70">
            Browse available Stage1 runs and load a bundle.
          </div>
        </div>
        <Button
          variant="outline"
          className="border-white/20 bg-white/5 text-white hover:bg-white/10"
          size="sm"
          onClick={refreshRuns}
          disabled={loading || busy}
        >
          Refresh
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by hostname or project"
          className="w-full flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/80 placeholder:text-white/40 focus:border-white/30 focus:outline-none"
        />
        {showProjectFilter ? (
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-xs text-white/80 focus:border-white/30 focus:outline-none"
          >
            <option value={ALL_PROJECTS}>All projects</option>
            {uniqueProjects.ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
            {uniqueProjects.hasUnlinked ? (
              <option value={UNLINKED}>Unlinked</option>
            ) : null}
          </select>
        ) : null}
        {filter || projectFilter !== ALL_PROJECTS ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:bg-white/10"
            onClick={() => {
              setFilter("");
              setProjectFilter(ALL_PROJECTS);
            }}
            disabled={loading || busy}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {error ? (
        <ToolOutputCardCallout tone="danger" className="mt-3">
          {error}
        </ToolOutputCardCallout>
      ) : null}

      {loading ? (
        <ToolOutputCardCallout tone="info" className="mt-3">
          Fetching Stage1 runs...
        </ToolOutputCardCallout>
      ) : null}

      {!loading && !error && groupedRuns.length === 0 ? (
        <ToolOutputCardCallout tone="warning" className="mt-3">
          No Stage1 runs found. Trigger a Stage1 inspection to populate runs.
        </ToolOutputCardCallout>
      ) : null}

      <div className="mt-4 space-y-3">
        {groupedRuns.map(([hostname, hostRuns]) => (
          <div
            key={hostname}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
          >
            <div className="border-b border-white/10 bg-black/30 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/60">
              {hostname}
            </div>
            <div className="divide-y divide-white/10">
              {hostRuns.map((run) => {
                const isSelected = run.runId === selectedRunId;
                const isAssociated = run.runId === associatedRunId;
                const meta = artifactMap.get(run.runId);
                const modeLabel = formatMode(run.mode);

                return (
                  <button
                    key={run.runId}
                    type="button"
                    onClick={() => onSelect(run)}
                    disabled={busy || loading}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition",
                      "hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
                      isSelected ? "bg-white/10" : "bg-transparent",
                      busy || loading ? "cursor-not-allowed opacity-60" : ""
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {formatRunId(run.runId)}
                        </span>
                        {run.projectId ? (
                          <span className="truncate rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
                            {run.projectId}
                          </span>
                        ) : null}
                        {isAssociated ? (
                          <span className="truncate rounded-md border border-emerald-400/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-100">
                            associated
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-white/50">
                          {formatTimestamp(run.timestamp)}
                        </span>
                        {modeLabel ? (
                          <span className="text-[10px] text-white/40">
                            {modeLabel}
                            {run.mode === "suite" && run.targetCount
                              ? ` (${run.targetCount} targets)`
                              : ""}
                          </span>
                        ) : null}
                      </div>
                      {meta && meta.types.length > 0 ? (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {meta.types.map((type) => (
                            <ArtifactBadge key={type} type={type} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-xs uppercase tracking-[0.2em] text-cyan-200/70">
                      {getRunActionLabel(isSelected, isAssociated)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
