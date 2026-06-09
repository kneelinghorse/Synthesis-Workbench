import type { Comment } from "@/lib/stores/comment-state";
import type { DesignDocument, DesignNode } from "@/types/document-model";
import { isComponentNode, isLayoutNode } from "@/types/document-model";

/**
 * Packages the live review state — the working document, active token overrides,
 * and the human's pinned comments — into a system-prompt section so the agent
 * can propose targeted edits (patch_node / set_document) that address the
 * critique. Pure + string-only so it stays unit-testable.
 */

type TokenChange = { from: string; to: string };

// Keep the per-turn system prompt bounded: inline the full document JSON only
// while it's small; beyond this, fall back to a compact id/ref/props outline
// (still enough for the agent to target patch_node by id).
const DOCUMENT_JSON_CAP = 16_000;

const truncateValue = (value: unknown): string => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (typeof text !== "string") {
    return "";
  }
  return text.length > 40 ? `${text.slice(0, 37)}…` : text;
};

const summarizeNode = (node: DesignNode, depth: number, out: string[]): void => {
  const indent = "  ".repeat(depth);
  if (isComponentNode(node)) {
    const props = node.props
      ? Object.entries(node.props)
          .map(([key, value]) => `${key}=${truncateValue(value)}`)
          .join(" ")
      : "";
    out.push(`${indent}- ${node.id} (${node.ref})${props ? ` — ${props}` : ""}`);
  } else if (isLayoutNode(node)) {
    out.push(`${indent}- [${node.layout?.type ?? "layout"}]`);
    for (const child of node.children) {
      summarizeNode(child, depth + 1, out);
    }
  }
};

const summarizeDocument = (document: DesignDocument): string => {
  const out: string[] = [];
  summarizeNode(document.root, 0, out);
  return out.join("\n");
};

const describeAnchor = (comment: Comment): string =>
  comment.anchor.kind === "instance"
    ? `node ${comment.anchor.componentId ?? "?"}`
    : `slot "${comment.anchor.slotLabel ?? "?"}"`;

/** Render the OPEN (unresolved) comments as an actionable list, or "" if none. */
export const formatReviewComments = (comments: Comment[]): string => {
  const open = comments.filter((comment) => !comment.resolved);
  if (open.length === 0) {
    return "";
  }
  const lines = [
    "## Pinned review comments",
    "The human pinned these critiques to elements in the preview. Address each by " +
      "patching the named node — keep its id so the pin stays anchored:",
    "",
  ];
  for (const comment of open) {
    lines.push(`- [${describeAnchor(comment)}] ${comment.text}`);
  }
  return lines.join("\n");
};

export const formatReviewContext = (input: {
  document: DesignDocument | null;
  tokenChanges?: Record<string, TokenChange>;
  comments?: Comment[];
}): string => {
  const { document, tokenChanges = {}, comments = [] } = input;
  const commentsSection = formatReviewComments(comments);

  // Nothing live to package — keep the prompt lean.
  if (!document && !commentsSection) {
    return "";
  }

  const lines: string[] = ["# CURRENT DESIGN (live working state)"];

  if (document) {
    lines.push(
      "## Active document",
      "Target nodes by `id`; ids are stable across edits (patch_node preserves " +
        "them), so prefer patch_node for comment-driven changes.",
    );
    if (JSON.stringify(document).length <= DOCUMENT_JSON_CAP) {
      lines.push("```json", JSON.stringify(document, null, 2), "```");
    } else {
      lines.push(
        "(Outline only — the full document is too large to inline. Each line is " +
          "`id (ref) — props`.)",
        "```",
        summarizeDocument(document),
        "```",
      );
    }
  } else {
    lines.push("## Active document", "No document loaded yet.");
  }

  const changeEntries = Object.entries(tokenChanges);
  if (changeEntries.length > 0) {
    lines.push("", "## Active token overrides");
    for (const [path, change] of changeEntries) {
      lines.push(`- ${path}: ${change.from} → ${change.to}`);
    }
  }

  if (commentsSection) {
    lines.push("", commentsSection);
  }

  return lines.join("\n");
};
