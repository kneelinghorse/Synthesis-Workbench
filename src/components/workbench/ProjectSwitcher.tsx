"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  ChevronDown,
  FolderOpen,
  Plus,
  Check,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useDataContextStore } from "@/lib/stores/data-context";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import { useProjectStateStore } from "@/lib/stores/project-state";
import {
  resetStage1BundleStore,
  useStage1BundleStore,
} from "@/lib/stores/stage1-bundle";
import {
  resetTokenState,
  useTokenStateStore,
} from "@/lib/stores/token-state";

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

export const ProjectSwitcher = ({ className }: { className?: string }) => {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);

  const activeProjectSlug = useProjectStateStore(
    (state) => state.activeProjectSlug
  );
  const setActiveProject = useProjectStateStore(
    (state) => state.setActiveProject
  );

  const activeProject = projects.find((p) => p.slug === activeProjectSlug);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load projects");
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  const hydrateWorkspace = useCallback(
    (payload: ProjectWorkspaceResponse["workspace"]) => {
      if (payload.workspace?.document) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useDocumentStateStore.getState().setDocument(payload.workspace.document as any);
      } else {
        useDocumentStateStore.getState().setDocument(null);
      }

      useDataContextStore
        .getState()
        .setContext(payload.workspace?.dataContext ?? {});

      if (payload.workspace?.tokenState) {
        useTokenStateStore.getState().hydrateFromSnapshot({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useStage1BundleStore.getState().loadBundle(payload.bundleAssociation.bundle as any);
      } else {
        resetStage1BundleStore();
      }
    },
    []
  );

  const switchProject = useCallback(
    async (slug: string) => {
      if (slug === activeProjectSlug) {
        setOpen(false);
        return;
      }

      setSwitching(slug);
      setError(null);
      try {
        const res = await fetch(
          `/api/projects?slug=${encodeURIComponent(slug)}`,
          { cache: "no-store" }
        );
        const payload = (await res.json()) as ProjectWorkspaceResponse & {
          error?: string;
        };
        if (!res.ok)
          throw new Error(payload.error || "Failed to open project");

        setActiveProject(slug, payload.workspace.activeDesignSlug ?? null);
        hydrateWorkspace(payload.workspace);
        setOpen(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to switch project"
        );
      } finally {
        setSwitching(null);
      }
    },
    [activeProjectSlug, hydrateWorkspace, setActiveProject]
  );

  const createProject = useCallback(async () => {
    const name = createName.trim();
    if (!name) return;

    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to create project");

      setCreateName("");
      setShowCreate(false);
      await fetchProjects();
      if (data.project?.slug) {
        await switchProject(data.project.slug);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create project"
      );
    } finally {
      setCreating(false);
    }
  }, [createName, fetchProjects, switchProject]);

  useEffect(() => {
    if (open) {
      void fetchProjects();
      setShowCreate(false);
      setCreateName("");
      setError(null);
    }
  }, [open, fetchProjects]);

  useEffect(() => {
    if (showCreate) {
      // Focus after render
      requestAnimationFrame(() => createInputRef.current?.focus());
    }
  }, [showCreate]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm transition hover:bg-white/10",
            open && "border-white/25 bg-white/10",
            className
          )}
          aria-label="Switch project"
        >
          <FolderOpen className="size-3.5 text-white/60" />
          <span className="max-w-[160px] truncate text-white/90">
            {activeProject?.name ?? activeProjectSlug ?? "No project"}
          </span>
          <ChevronDown
            className={cn(
              "size-3 text-white/50 transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="z-50 w-72 rounded-xl border border-white/12 bg-[#12141a] shadow-[0_16px_64px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/8 px-3 py-2.5">
            <span className="text-[11px] uppercase tracking-[0.25em] text-white/45">
              Projects
            </span>
            <button
              type="button"
              onClick={() => setShowCreate((s) => !s)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white/90"
              aria-label="Create new project"
            >
              <Plus className="size-3" />
              New
            </button>
          </div>

          {/* Create form */}
          {showCreate ? (
            <div className="border-b border-white/8 px-3 py-2.5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void createProject();
                }}
                className="flex gap-2"
              >
                <input
                  ref={createInputRef}
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Project name..."
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
                  disabled={creating}
                />
                <button
                  type="submit"
                  disabled={creating || !createName.trim()}
                  className="shrink-0 rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-white transition hover:bg-white/20 disabled:opacity-40"
                >
                  {creating ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    "Create"
                  )}
                </button>
              </form>
            </div>
          ) : null}

          {/* Error */}
          {error ? (
            <div className="border-b border-rose-500/20 bg-rose-500/8 px-3 py-2 text-[11px] text-rose-200">
              {error}
            </div>
          ) : null}

          {/* Project list */}
          <div className="max-h-64 overflow-y-auto py-1">
            {loading && projects.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-white/40" />
              </div>
            ) : projects.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-white/40">
                No projects yet
              </div>
            ) : (
              projects.map((project) => {
                const isActive = project.slug === activeProjectSlug;
                const isSwitching = switching === project.slug;

                return (
                  <button
                    key={project.slug}
                    type="button"
                    onClick={() => void switchProject(project.slug)}
                    disabled={isSwitching}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left transition",
                      isActive
                        ? "bg-emerald-500/8 text-white"
                        : "text-white/75 hover:bg-white/6"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium">
                          {project.name}
                        </span>
                        {isActive ? (
                          <Check className="size-3 shrink-0 text-emerald-400" />
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[10px] text-white/40">
                        {project.designCount} design
                        {project.designCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    {isSwitching ? (
                      <Loader2 className="size-3 shrink-0 animate-spin text-white/50" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
