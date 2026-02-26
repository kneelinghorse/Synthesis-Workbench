"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, Search, Zap } from "lucide-react";

import {
  type FoundryCatalogComponent,
  getFallbackComponentCatalog,
  WORKBENCH_S44_COMPONENTS,
} from "@/lib/foundry/catalog";
import { writeCommandToComposer } from "@/lib/workbench/keyboard-shortcuts";
import { cn } from "@/lib/utils";

const FALLBACK_CATALOG = getFallbackComponentCatalog();

const TRAIT_BADGE_COLORS: Record<string, string> = {
  Action: "border-blue-400/30 text-blue-300",
  Container: "border-purple-400/30 text-purple-300",
  Layout: "border-teal-400/30 text-teal-300",
  Typography: "border-amber-400/30 text-amber-300",
  "Form Input": "border-emerald-400/30 text-emerald-300",
  "Status Display": "border-rose-400/30 text-rose-300",
  "Data Presentation": "border-cyan-400/30 text-cyan-300",
};

const defaultTraitColor = "border-white/20 text-white/60";

const buildInsertCommand = (component: FoundryCatalogComponent): string => {
  const propsHint =
    component.requiredProps.length > 0
      ? ` with ${component.requiredProps.map((p) => `${p}="…"`).join(", ")}`
      : "";
  return `Add an oods:${component.name} component${propsHint}`;
};

const ComponentCard = ({
  component,
  expanded,
  onToggle,
  onInsert,
}: {
  component: FoundryCatalogComponent;
  expanded: boolean;
  onToggle: () => void;
  onInsert: () => void;
}) => (
  <div
    className={cn(
      "rounded-xl border transition-colors",
      expanded
        ? "border-white/20 bg-white/[0.06]"
        : "border-white/10 bg-white/[0.03] hover:border-white/15"
    )}
  >
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      aria-expanded={expanded}
    >
      <span className="flex-1 text-xs font-medium text-white">
        oods:{component.name}
      </span>
      {component.traits.slice(0, 2).map((trait) => (
        <span
          key={trait}
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
            TRAIT_BADGE_COLORS[trait] ?? defaultTraitColor
          )}
        >
          {trait}
        </span>
      ))}
      <ChevronDown
        className={cn(
          "size-3 shrink-0 text-white/40 transition-transform",
          expanded && "rotate-180"
        )}
      />
    </button>

    {expanded && (
      <div className="border-t border-white/8 px-3 pb-3 pt-2">
        {component.description && (
          <p className="text-[11px] leading-relaxed text-white/55">
            {component.description}
          </p>
        )}

        {component.requiredProps.length > 0 && (
          <div className="mt-2">
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              Required Props
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {component.requiredProps.map((prop) => (
                <code
                  key={prop}
                  className="rounded border border-white/12 bg-black/30 px-1.5 py-0.5 text-[10px] text-white/70"
                >
                  {prop}
                </code>
              ))}
            </div>
          </div>
        )}

        {component.traits.length > 0 && (
          <div className="mt-2">
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              Traits
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {component.traits.map((trait) => (
                <span
                  key={trait}
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[9px]",
                    TRAIT_BADGE_COLORS[trait] ?? defaultTraitColor
                  )}
                >
                  {trait}
                </span>
              ))}
            </div>
          </div>
        )}

        {component.variants.length > 0 && (
          <div className="mt-2">
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              Variants
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {component.variants.map((variant) => (
                <span
                  key={variant}
                  className="rounded border border-white/12 px-1.5 py-0.5 text-[9px] text-white/50"
                >
                  {variant}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onInsert}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-emerald-300 transition hover:border-emerald-400/50 hover:bg-emerald-500/20"
        >
          <Zap className="size-3" />
          Insert into Chat
        </button>
      </div>
    )}
  </div>
);

export const ComponentBrowser = ({
  className,
}: {
  className?: string;
}) => {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [insertNotice, setInsertNotice] = useState<string | null>(null);

  const components = useMemo(() => {
    const all = FALLBACK_CATALOG.components;
    if (!search.trim()) return all;

    const query = search.trim().toLowerCase();
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.traits.some((t) => t.toLowerCase().includes(query)) ||
        c.requiredProps.some((p) => p.toLowerCase().includes(query))
    );
  }, [search]);

  const handleInsert = useCallback((component: FoundryCatalogComponent) => {
    const command = buildInsertCommand(component);
    const wrote = writeCommandToComposer(command);

    if (wrote) {
      setInsertNotice(`Inserted oods:${component.name}`);
    } else {
      setInsertNotice("Chat composer not available");
    }

    const timer = window.setTimeout(() => setInsertNotice(null), 2000);
    return () => window.clearTimeout(timer);
  }, []);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  }, []);

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/5 p-4",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[10px] uppercase tracking-[0.3em] text-white/50">
            Component Browser
          </h3>
          <p className="mt-0.5 text-[11px] text-white/40">
            {WORKBENCH_S44_COMPONENTS.length} components available
          </p>
        </div>
        {insertNotice && (
          <span
            role="status"
            className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300"
          >
            {insertNotice}
          </span>
        )}
      </div>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-white/35" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search components, traits, props..."
          aria-label="Search components"
          className="w-full rounded-lg border border-white/12 bg-black/30 py-2 pl-8 pr-3 text-xs text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
        />
      </div>

      <div className="mt-3 grid gap-1.5" role="list" aria-label="Component list">
        {components.length === 0 ? (
          <p className="py-4 text-center text-xs text-white/40">
            No components match &ldquo;{search}&rdquo;
          </p>
        ) : (
          components.map((component) => (
            <div key={component.id} role="listitem">
              <ComponentCard
                component={component}
                expanded={expandedId === component.id}
                onToggle={() => handleToggle(component.id)}
                onInsert={() => handleInsert(component)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};
