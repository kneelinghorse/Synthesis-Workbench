"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useDataContextStore } from "@/lib/stores/data-context";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { applyTemplate } from "@/lib/templates/apply-template";
import { cn } from "@/lib/utils";
import type { DesignNode } from "@/types/document-model";
import type { DesignTemplate } from "@/types/template-model";

type TemplateCatalogEntry = {
  source: "built-in" | "custom";
  slug: string;
  name: string;
  description: string;
  category: string;
  previewThumbnail?: string;
  requiredComponents: string[];
  updatedAt?: string;
};

type TemplateCatalogResponse = {
  listed: boolean;
  count: number;
  templates: TemplateCatalogEntry[];
  error?: string;
};

type TemplateDetailResponse = {
  loaded: boolean;
  source: "built-in" | "custom";
  slug: string;
  template: DesignTemplate;
  error?: string;
};

const ALL_CATEGORIES = "__all__";

const templateKey = (entry: TemplateCatalogEntry) =>
  `${entry.source}:${entry.slug}`;

const resolveComponentLabel = (ref: string) => ref.replace(/^oods:/, "");

const formatRelativeTime = (isoDate?: string) => {
  if (!isoDate) return "unknown";
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

const PreviewNode = ({ node, depth = 0 }: { node: DesignNode; depth?: number }) => {
  if (node.nodeType === "component") {
    return (
      <div className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[10px] text-white/80">
        {resolveComponentLabel(node.ref)}
      </div>
    );
  }

  const children = node.children.slice(0, 4);
  const remaining = node.children.length - children.length;

  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-[0.15em] text-white/55">
        {node.layout.type}
      </div>
      <div
        className={cn(
          "grid gap-1",
          node.layout.type === "grid" ? "grid-cols-2" : "grid-cols-1",
          depth > 1 ? "opacity-80" : ""
        )}
      >
        {children.map((child, index) => (
          <PreviewNode key={`${depth}-${index}`} node={child} depth={depth + 1} />
        ))}
      </div>
      {remaining > 0 ? (
        <div className="text-[10px] text-white/45">+{remaining} more nodes</div>
      ) : null}
    </div>
  );
};

export const TemplateBrowser = ({ className }: { className?: string }) => {
  const [templates, setTemplates] = useState<TemplateCatalogEntry[]>([]);
  const [filter, setFilter] = useState<string>(ALL_CATEGORIES);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [templateCache, setTemplateCache] = useState<
    Record<string, DesignTemplate>
  >({});
  const [loading, setLoading] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const setDocument = useDocumentStateStore((state) => state.setDocument);
  const setDataContext = useDataContextStore((state) => state.setContext);

  const refreshTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/templates", { cache: "no-store" });
      const payload = (await response.json()) as TemplateCatalogResponse;
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "Failed to load templates");
      }

      const records = Array.isArray(payload.templates) ? payload.templates : [];
      setTemplates(records);

      setSelectedKey((previous) => {
        if (previous && records.some((entry) => templateKey(entry) === previous)) {
          return previous;
        }
        return records.length > 0 ? templateKey(records[0]) : null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
      setTemplates([]);
      setSelectedKey(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTemplates();
  }, [refreshTemplates]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const template of templates) {
      values.add(template.category);
    }
    return [ALL_CATEGORIES, ...Array.from(values).sort()];
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) =>
      filter === ALL_CATEGORIES ? true : template.category === filter
    );
  }, [filter, templates]);

  useEffect(() => {
    if (filteredTemplates.length === 0) {
      setSelectedKey(null);
      return;
    }

    const hasSelected = selectedKey
      ? filteredTemplates.some((entry) => templateKey(entry) === selectedKey)
      : false;

    if (!hasSelected) {
      setSelectedKey(templateKey(filteredTemplates[0]));
    }
  }, [filteredTemplates, selectedKey]);

  useEffect(() => {
    if (!selectedKey) return;
    if (templateCache[selectedKey]) return;

    const selected = templates.find((entry) => templateKey(entry) === selectedKey);
    if (!selected) return;

    let cancelled = false;
    const loadTemplate = async () => {
      setLoadingTemplate(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/templates?slug=${encodeURIComponent(selected.slug)}`,
          {
            cache: "no-store",
          }
        );
        const payload = (await response.json()) as TemplateDetailResponse;
        if (!response.ok || payload.error) {
          throw new Error(payload.error || "Failed to load template");
        }
        if (cancelled) return;

        setTemplateCache((current) => ({
          ...current,
          [selectedKey]: payload.template,
        }));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load template preview"
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingTemplate(false);
        }
      }
    };

    void loadTemplate();
    return () => {
      cancelled = true;
    };
  }, [selectedKey, templateCache, templates]);

  const selectedTemplateEntry = useMemo(
    () => templates.find((entry) => templateKey(entry) === selectedKey) ?? null,
    [selectedKey, templates]
  );

  const selectedTemplate = selectedKey ? templateCache[selectedKey] : undefined;

  const applySelectedTemplate = useCallback(async () => {
    if (!selectedTemplateEntry || !selectedTemplate) {
      return;
    }

    setApplying(true);
    setStatus(null);
    try {
      const document = applyTemplate(selectedTemplate);
      setDocument(document);
      setDataContext(document.data ?? {});
      setStatus(
        `Applied template "${selectedTemplateEntry.name}" with ${selectedTemplate.requiredComponents?.length ?? 0} required components.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply template");
    } finally {
      setApplying(false);
    }
  }, [selectedTemplate, selectedTemplateEntry, setDataContext, setDocument]);

  return (
    <section
      className={cn(
        "rounded-3xl border border-white/10 bg-white/5 p-4 text-white/80 backdrop-blur",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-white/45">
            Template Browser
          </p>
          <h2 className="mt-1 text-sm font-semibold text-white">
            Browse and apply reusable design starters
          </h2>
          <p className="mt-1 text-xs text-white/60">
            Built-in and custom templates appear together.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-lg border border-white/20 bg-black/35 px-2 py-1 text-xs text-white focus:border-white/40 focus:outline-none"
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category === ALL_CATEGORIES ? "all categories" : category}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={refreshTemplates}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {error}
        </div>
      ) : null}

      {status ? (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          {status}
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {filteredTemplates.length === 0 && !loading ? (
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
              No templates for selected category.
            </div>
          ) : null}

          {filteredTemplates.map((template) => {
            const key = templateKey(template);
            const selected = key === selectedKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                className={cn(
                  "w-full rounded-xl border px-3 py-2 text-left transition",
                  selected
                    ? "border-emerald-400/40 bg-emerald-500/10"
                    : "border-white/10 bg-black/20 hover:bg-white/10"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-white">{template.name}</span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em]",
                      template.source === "built-in"
                        ? "bg-blue-500/20 text-blue-100"
                        : "bg-emerald-500/20 text-emerald-100"
                    )}
                  >
                    {template.source}
                  </span>
                  <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
                    {template.category}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/65">
                  {template.description}
                </p>
                <p className="mt-1 text-[10px] text-white/45">
                  updated {formatRelativeTime(template.updatedAt)}
                </p>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          {selectedTemplateEntry ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {selectedTemplateEntry.name}
                  </h3>
                  <p className="mt-1 text-xs text-white/65">
                    {selectedTemplateEntry.description}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={applySelectedTemplate}
                  disabled={!selectedTemplate || applying || loadingTemplate}
                >
                  {applying ? "Applying..." : "Apply Template"}
                </Button>
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-2">
                {loadingTemplate || !selectedTemplate ? (
                  <div className="text-xs text-white/55">Loading template preview...</div>
                ) : (
                  <PreviewNode node={selectedTemplate.document.root} />
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(selectedTemplateEntry.requiredComponents ?? []).map((ref) => (
                  <span
                    key={ref}
                    className="rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] text-white/70"
                  >
                    {resolveComponentLabel(ref)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="text-xs text-white/55">Select a template to preview.</div>
          )}
        </div>
      </div>
    </section>
  );
};
