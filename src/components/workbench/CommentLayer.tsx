"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PreviewAnchorRect } from "@/lib/preview/message-types";
import {
  anchorKey,
  anchorMatchesPreview,
  useCommentStateStore,
  type Comment,
  type CommentAnchor,
} from "@/lib/stores/comment-state";
import { cn } from "@/lib/utils";

/** A live anchor position reported by the iframe (PREVIEW_ANCHORS). */
export type LiveAnchor = {
  nodeId: string | null;
  label: string | null;
  rect: PreviewAnchorRect;
};

/** A fresh click selection awaiting a comment (PREVIEW_SELECTION). */
export type PendingSelection = {
  anchor: CommentAnchor;
  rect: PreviewAnchorRect;
  text: string;
};

type CommentLayerProps = {
  /** Latest anchor rects from the iframe; pins re-resolve against these. */
  anchors: LiveAnchor[];
  /** The pending selection to compose against, or null. */
  selection: PendingSelection | null;
  onDismissSelection: () => void;
};

const anchorLabel = (anchor: CommentAnchor): string =>
  anchor.kind === "slot" ? anchor.slotLabel ?? "slot" : anchor.componentId ?? "element";

const rectFor = (
  anchor: CommentAnchor,
  anchors: LiveAnchor[],
): PreviewAnchorRect | null => {
  const match = anchors.find((live) => anchorMatchesPreview(anchor, live));
  return match ? match.rect : null;
};

/**
 * Plain-React comment overlay rendered over the preview iframe. Pins are
 * positioned from the iframe-reported anchor rects (the parent can't read the
 * sandboxed DOM), so they re-resolve automatically as PREVIEW_ANCHORS updates
 * after each COMPONENT_UPDATE / scroll / resize.
 */
export const CommentLayer = ({
  anchors,
  selection,
  onDismissSelection,
}: CommentLayerProps) => {
  const comments = useCommentStateStore((state) => state.comments);
  const addComment = useCommentStateStore((state) => state.addComment);
  const resolveComment = useCommentStateStore((state) => state.resolveComment);
  const deleteComment = useCommentStateStore((state) => state.deleteComment);

  const [draft, setDraft] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerPos, setComposerPos] = useState<{ left: number; top: number } | null>(null);

  // Keep the composer fully inside the (overflow-hidden) preview bounds: prefer
  // the right of the element, flip to the left when it won't fit, then clamp on
  // both axes. Runs before paint so the off-screen position is never shown.
  useLayoutEffect(() => {
    if (!selection) {
      setComposerPos(null);
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const margin = 8;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const w = composerRef.current?.offsetWidth ?? 256;
    const h = composerRef.current?.offsetHeight ?? 160;
    const { rect } = selection;

    let left = rect.left + rect.width + margin;
    if (left + w + margin > cw) {
      left = rect.left - w - margin;
    }
    left = Math.max(margin, Math.min(left, Math.max(margin, cw - w - margin)));

    let top = rect.top + rect.height / 2 - h / 2;
    top = Math.max(margin, Math.min(top, Math.max(margin, ch - h - margin)));

    setComposerPos({ left, top });
  }, [selection]);

  // Group comments by anchor — one pin per anchored location.
  const groups = useMemo(() => {
    const map = new Map<string, { anchor: CommentAnchor; list: Comment[] }>();
    for (const comment of comments) {
      const key = anchorKey(comment.anchor);
      const existing = map.get(key);
      if (existing) {
        existing.list.push(comment);
      } else {
        map.set(key, { anchor: comment.anchor, list: [comment] });
      }
    }
    return map;
  }, [comments]);

  const handleSave = () => {
    if (!selection) {
      return;
    }
    addComment(selection.anchor, draft);
    setDraft("");
    onDismissSelection();
  };

  const handleCancel = () => {
    setDraft("");
    onDismissSelection();
  };

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Comment pins, one per anchored location */}
      {Array.from(groups.values()).map(({ anchor, list }) => {
        const rect = rectFor(anchor, anchors);
        if (!rect) {
          return null;
        }
        const key = anchorKey(anchor);
        const unresolved = list.filter((comment) => !comment.resolved).length;
        const isOpen = openKey === key;
        return (
          <div
            key={key}
            className="pointer-events-none absolute"
            style={{ left: rect.left, top: rect.top }}
          >
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : key)}
              title={`${list.length} comment${list.length === 1 ? "" : "s"} on ${anchorLabel(anchor)}`}
              className={cn(
                "pointer-events-auto flex h-6 min-w-[1.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full px-1.5 text-xs font-semibold text-white shadow ring-2 ring-white/70 transition",
                unresolved > 0
                  ? "bg-indigo-500 hover:bg-indigo-400"
                  : "bg-slate-500/80 hover:bg-slate-400",
              )}
            >
              {list.length}
            </button>
            {isOpen ? (
              <div className="pointer-events-auto absolute left-3 top-3 z-20 w-64 rounded-xl border border-white/10 bg-slate-900/95 p-3 text-sm text-white shadow-xl backdrop-blur">
                <ul className="space-y-2">
                  {list.map((comment) => (
                    <CommentRow
                      key={comment.id}
                      comment={comment}
                      onResolve={resolveComment}
                      onDelete={deleteComment}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Composer for a fresh selection */}
      {selection ? (
        <div
          ref={composerRef}
          className="pointer-events-auto absolute z-30 w-64 rounded-xl border border-white/10 bg-slate-900/95 p-3 shadow-xl backdrop-blur"
          style={
            composerPos ?? {
              left: selection.rect.left + selection.rect.width + 8,
              top: selection.rect.top,
            }
          }
        >
          <p
            className="mb-2 truncate text-xs text-white/60"
            title={selection.text}
          >
            {anchorLabel(selection.anchor)}
            {selection.text ? ` — “${selection.text}”` : ""}
          </p>
          <textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Leave a critique…"
            rows={3}
            className="w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                handleSave();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                handleCancel();
              }
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!draft.trim()}>
              Comment
            </Button>
          </div>
        </div>
      ) : null}

      {/* Side list of all comments */}
      {comments.length > 0 ? (
        <div className="pointer-events-auto absolute right-3 top-3 z-10 max-h-[calc(100%-1.5rem)] w-60 overflow-auto rounded-xl border border-white/10 bg-slate-900/80 p-3 text-sm text-white shadow-lg backdrop-blur">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
            Comments · {comments.length}
          </p>
          <ul className="space-y-2">
            {comments.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                detached={!rectFor(comment.anchor, anchors)}
                showAnchor
                onResolve={resolveComment}
                onDelete={deleteComment}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

type CommentRowProps = {
  comment: Comment;
  detached?: boolean;
  showAnchor?: boolean;
  onResolve: (id: string, resolved?: boolean) => void;
  onDelete: (id: string) => void;
};

const CommentRow = ({
  comment,
  detached = false,
  showAnchor = false,
  onResolve,
  onDelete,
}: CommentRowProps) => (
  <li className="rounded-lg bg-white/5 p-2">
    <p
      className={cn(
        "whitespace-pre-wrap break-words",
        comment.resolved && "line-through opacity-60",
      )}
    >
      {comment.text}
    </p>
    {showAnchor ? (
      <div className="mt-1 flex items-center gap-2 text-xs text-white/50">
        <span className="truncate">{anchorLabel(comment.anchor)}</span>
        {detached ? (
          <span
            className="text-amber-300/80"
            title="This anchor is not in the current preview"
          >
            detached
          </span>
        ) : null}
      </div>
    ) : null}
    <div className="mt-1 flex gap-2 text-xs">
      <button
        type="button"
        className="text-indigo-300 hover:text-indigo-200"
        onClick={() => onResolve(comment.id, !comment.resolved)}
      >
        {comment.resolved ? "Reopen" : "Resolve"}
      </button>
      <button
        type="button"
        className="text-rose-300 hover:text-rose-200"
        onClick={() => onDelete(comment.id)}
      >
        Delete
      </button>
    </div>
  </li>
);
