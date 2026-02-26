"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDataContextStore } from "@/lib/stores/data-context";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { useProjectStateStore } from "@/lib/stores/project-state";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import { resetStage1BundleStore, useStage1BundleStore } from "@/lib/stores/stage1-bundle";
import { resetTokenState, useTokenStateStore } from "@/lib/stores/token-state";

type ProjectSummary = {
  slug: string;
  name: string;
  description?: string;
  designCount: number;
  activeDesignSlug?: string;
  updatedAt: string;
  lastModifiedAt: string;
};

type ProjectWorkspaceResponse = {
  project: ProjectSummary;
  workspace: {
    activeDesignSlug: string | null;
    workspace: {
      document: unknown;
      dataContext: Record<string, unknown>;
      tokenState: {
        values: Record<string, unknown>;
        changes: Record<string, { from: string; to: string }>;
        history: Array<{
          path: string;
          from: string;
          to: string;
          source: "manual" | "stage1" | "import" | "migration" | "system";
          at: string;
        }>;
        annotations?: Record<string, string>;
        theme?: "base" | "dark" | "hc";
      };
    } | null;
    bundleAssociation: {
      sourceRun: { runId: string };
      bundle: unknown | null;
    } | null;
  };
};

const formatRelativeTime = (isoDate: string) => {
  const target = Date.parse(isoDate);
  if (Number.isNaN(target)) return "unknown";
  const minutes = Math.floor((Date.now() - target) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const resolveBundleHost = (bundle: unknown): string | undefined => {
  if (!bundle || typeof bundle !== "object") return undefined;

  const manifest = (bundle as Record<string, unknown>).manifest;
  if (!manifest || typeof manifest !== "object") return undefined;

  const targets = (manifest as Record<string, unknown>).targets;
  if (!Array.isArray(targets) || targets.length === 0) return undefined;
  const first = targets[0];
  if (!first || typeof first !== "object") return undefined;

  const fromName = (first as Record<string, unknown>).name;
  if (typeof fromName === "string" && fromName.trim()) {
    return fromName.trim();
  }

  const fromUrl = (first as Record<string, unknown>).url;
  if (typeof fromUrl === "string" && fromUrl.trim()) {
    try {
      return new URL(fromUrl).hostname;
    } catch {
      return fromUrl;
    }
  }

  return undefined;
};

export const ProjectBrowser = ({ className }: { className?: string }) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [createName, setCreateName] = useState("");
  const [includeCurrentBundle, setIncludeCurrentBundle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openingSlug, setOpeningSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baselineRef = useRef<string | null>(null);

  const activeProjectSlug = useProjectStateStore((state) => state.activeProjectSlug);
  const activeDesignSlug = useProjectStateStore((state) => state.activeDesignSlug);
  const setActiveProject = useProjectStateStore((state) => state.setActiveProject);

  const document = useDocumentStateStore((state) => state.document);
  const dataContext = useDataContextStore((state) => state.context);
  const tokens = useTokenStateStore((state) => state.tokens);
  const tokenChanges = useTokenStateStore((state) => state.changes);
  const tokenHistory = useTokenStateStore((state) => state.history);
  const tokenAnnotations = useTokenStateStore((state) => state.annotations);
  const previewTheme = usePreviewStateStore((state) => state.theme);
  const bundle = useStage1BundleStore((state) => state.bundle);
  const loadedAt = useStage1BundleStore((state) => state.loadedAt);

  const currentFingerprint = useMemo(
    () =>
      JSON.stringify({
        document,
        dataContext,
        tokens,
        tokenChanges,
        tokenHistory,
        tokenAnnotations,
        previewTheme,
        bundle,
        loadedAt,
      }),
    [
      bundle,
      dataContext,
      document,
      loadedAt,
      previewTheme,
      tokenChanges,
      tokenHistory,
      tokenAnnotations,
      tokens,
    ]
  );

  const isDirty =
    baselineRef.current !== null && baselineRef.current !== currentFingerprint;

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load projects");
      }

      setProjects(Array.isArray(payload.projects) ? payload.projects : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const captureBaseline = useCallback(() => {
    const tokenSnapshot = useTokenStateStore.getState().getPersistedSnapshot();
    baselineRef.current = JSON.stringify({
      document: useDocumentStateStore.getState().document,
      dataContext: useDataContextStore.getState().context,
      tokens: tokenSnapshot.tokens,
      tokenChanges: tokenSnapshot.changes,
      tokenHistory: tokenSnapshot.history,
      tokenAnnotations: tokenSnapshot.annotations,
      previewTheme: usePreviewStateStore.getState().theme,
      bundle: useStage1BundleStore.getState().bundle,
      loadedAt: useStage1BundleStore.getState().loadedAt,
    });
  }, []);

  const hydrateWorkspace = useCallback(
    (payload: ProjectWorkspaceResponse["workspace"]) => {
      if (payload.workspace?.document) {
        useDocumentStateStore.getState().setDocument(payload.workspace.document as any);
      } else {
        useDocumentStateStore.getState().setDocument(null);
      }

      useDataContextStore
        .getState()
        .setContext(payload.workspace?.dataContext ?? {});

      if (payload.workspace?.tokenState) {
        useTokenStateStore.getState().hydrateFromSnapshot({
          tokens: payload.workspace.tokenState.values as any,
          changes: payload.workspace.tokenState.changes,
          history: payload.workspace.tokenState.history,
          annotations: payload.workspace.tokenState.annotations ?? {},
        });
        usePreviewStateStore
          .getState()
          .setTheme(payload.workspace.tokenState.theme ?? "base");
      } else {
        resetTokenState();
        usePreviewStateStore.getState().setTheme("base");
      }

      if (payload.bundleAssociation?.bundle) {
        useStage1BundleStore.getState().loadBundle(payload.bundleAssociation.bundle as any);
      } else {
        resetStage1BundleStore();
      }

      captureBaseline();
    },
    [captureBaseline]
  );

  const openProject = useCallback(
    async (projectSlug: string) => {
      if (
        isDirty &&
        activeProjectSlug &&
        activeProjectSlug !== projectSlug &&
        !window.confirm(
          "You have unsaved project changes. Switch projects and discard local changes?"
        )
      ) {
        return;
      }

      setOpeningSlug(projectSlug);
      setError(null);
      try {
        const response = await fetch(
          `/api/projects?slug=${encodeURIComponent(projectSlug)}`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as ProjectWorkspaceResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Failed to open project");
        }

        setActiveProject(projectSlug, payload.workspace.activeDesignSlug ?? null);
        hydrateWorkspace(payload.workspace);
        await refreshProjects();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to open project");
      } finally {
        setOpeningSlug(null);
      }
    },
    [activeProjectSlug, hydrateWorkspace, isDirty, refreshProjects, setActiveProject]
  );

  const createProject = useCallback(async () => {
    const name = createName.trim();
    if (!name) {
      setError("Project name is required.");
      return;
    }

    const currentBundle = useStage1BundleStore.getState().bundle;
    const currentLoadedAt = useStage1BundleStore.getState().loadedAt;
    const bundleAssociation =
      includeCurrentBundle && currentBundle
        ? {
            sourceRun: {
              runId: `seed-${Date.now()}`,
              hostname: resolveBundleHost(currentBundle),
              timestamp: currentLoadedAt ?? new Date().toISOString(),
            },
            bundle: currentBundle,
          }
        : undefined;

    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          bundleAssociation,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to create project");
      }

      setCreateName("");
      setIncludeCurrentBundle(false);
      await refreshProjects();
      if (payload.project?.slug) {
        await openProject(payload.project.slug);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  }, [createName, includeCurrentBundle, openProject, refreshProjects]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  return (
    <section
      className={cn(
        "rounded-3xl border border-white/10 bg-white/5 p-4 text-white/80 backdrop-blur",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-white/45">
            Project Browser
          </p>
          <h2 className="mt-1 text-sm font-semibold text-white">
            {activeProjectSlug ? `Active: ${activeProjectSlug}` : "No project loaded"}
          </h2>
          <p className="mt-1 text-xs text-white/60">
            {activeDesignSlug
              ? `Design: ${activeDesignSlug}`
              : "Open or create a project to restore workspace state."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty ? (
            <span className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-amber-100">
              Unsaved changes
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={refreshProjects}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs">
          <span className="text-white/55">New project name</span>
          <input
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            placeholder="Example: Retail Dashboard"
            className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
          />
        </label>
        <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={includeCurrentBundle}
            onChange={(event) => setIncludeCurrentBundle(event.target.checked)}
            className="size-3 accent-white"
          />
          Seed current bundle
        </label>
        <Button
          type="button"
          size="sm"
          onClick={createProject}
          disabled={loading || !createName.trim()}
        >
          Create
        </Button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {error}
        </div>
      ) : null}

      <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
        {projects.length === 0 && !loading ? (
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
            No projects found. Create one to get started.
          </div>
        ) : null}

        {projects.map((project) => {
          const isActive = project.slug === activeProjectSlug;
          const isOpening = openingSlug === project.slug;

          return (
            <div
              key={project.slug}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
                isActive
                  ? "border-emerald-400/30 bg-emerald-500/10"
                  : "border-white/10 bg-black/20"
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-white">
                    {project.name}
                  </span>
                  <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
                    {project.slug}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-white/55">
                  {project.designCount} design{project.designCount === 1 ? "" : "s"} ·
                  {" "}updated {formatRelativeTime(project.updatedAt)}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isActive ? "secondary" : "outline"}
                className={cn(
                  "shrink-0",
                  !isActive && "border-white/20 bg-white/5 text-white hover:bg-white/10"
                )}
                onClick={() => void openProject(project.slug)}
                disabled={loading || isOpening}
              >
                {isOpening ? "Opening..." : isActive ? "Open" : "Switch"}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
