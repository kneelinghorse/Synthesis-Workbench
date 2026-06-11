/**
 * s21-m04 ACCEPTANCE GATE 2 (decision 134 — the s16-m04 synthetic-success
 * guard: a REAL inspected app, not a fixture).
 *
 * Proves one live Stage1 seed flows end-to-end through the Workbench review
 * loop:
 *   Stage1 inspect (linear.app, run 4fdfcad4) -> stage1_oods_bridge
 *   composeHints -> design_compose (live :4466) -> UiSchema -> DesignDocument
 *   -> confirm gate apply -> REAL fragments render -> pin a comment on a real
 *   anchor -> agent regenerates addressing it -> comment resolves (decision
 *   122) -> remaining open comments reconcile (decisions 119/141).
 *
 * Runs the SAME functions the Tool UI runs (confirmForgeRegenerate,
 * forgeRegenerateCommentLink, resolveCommentsForChange,
 * reconcileAnchorsAfterRegenerate, reanchorComments) against the real zustand
 * stores — only the browser chrome is absent.
 *
 * Usage: npx tsx scripts/verify-forge-regenerate-gate2.ts [hintsPath]
 * Env:   OODS_FOUNDRY_MCP_URL (default http://127.0.0.1:4466/run)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildFoundryFragmentRenderInput,
  composeDocumentFromFoundryFragments,
  parseFoundryFragmentRenderOutput,
} from "../src/lib/engine/foundry-fragment-adapter";
import {
  isForgeComposedDocument,
  uiSchemaToDesignDocument,
} from "../src/lib/engine/foundry-compose-adapter";
import { createFoundryMcpClient } from "../src/lib/mcp/foundry-client";
import {
  collectExpectedRegenerateAnchors,
  confirmForgeRegenerate,
  forgeRegenerateCommentLink,
  reconcileAnchorsAfterRegenerate,
} from "../src/lib/runtime/tools/forge-regenerate-tools";
import {
  anchorFromPreview,
  useCommentStateStore,
} from "../src/lib/stores/comment-state";
import { useDocumentStateStore } from "../src/lib/stores/document-state";
import type { DesignDocument } from "../src/types/document-model";

const DEFAULT_BASE_URL = "http://127.0.0.1:4466/run";
const DEFAULT_HINTS_PATH =
  "out/stage1/linear-marketing/4fdfcad4-502a-495a-9b71-aa8a541d12c7/artifacts/compose_hints.json";

const baseUrl =
  process.env.OODS_FOUNDRY_MCP_URL?.trim() ||
  process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL?.trim() ||
  DEFAULT_BASE_URL;

type CheckResult = { id: string; pass: boolean; detail: string };
const checks: CheckResult[] = [];
const check = (id: string, pass: boolean, detail: string) => {
  checks.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id} — ${detail}`);
};

const extractAnchorPairs = (html: string) => {
  const anchors: Array<{ nodeId: string | null; label: string | null }> = [];
  const tagRe = /<[a-zA-Z][^>]*\bdata-oods-(?:node-id|label)="[^>]*>/g;
  for (const tag of html.match(tagRe) ?? []) {
    anchors.push({
      nodeId: tag.match(/\bdata-oods-node-id="([^"]*)"/)?.[1] ?? null,
      label: tag.match(/\bdata-oods-label="([^"]*)"/)?.[1] ?? null,
    });
  }
  return anchors;
};

const renderLive = async (
  client: ReturnType<typeof createFoundryMcpClient>,
  document: DesignDocument,
) => {
  const { renderInput, componentIndex } = buildFoundryFragmentRenderInput(document);
  const rendered = await client.render(renderInput);
  const parsed = parseFoundryFragmentRenderOutput(rendered.raw, componentIndex);
  return composeDocumentFromFoundryFragments(document, parsed);
};

const main = async () => {
  const hintsPath = process.argv[2] ?? DEFAULT_HINTS_PATH;
  console.log(`Gate 2 — live Stage1 (linear.app) seed end-to-end (${baseUrl})`);
  console.log(`  hints: ${hintsPath}\n`);

  const hintsFile = JSON.parse(await readFile(hintsPath, "utf8")) as {
    composeHints: Array<{ intent: string; layout?: string }>;
    metadata?: { source?: string; target?: { url?: string } };
  };
  const hint = hintsFile.composeHints[0];
  check(
    "seed-is-real-inspected-app",
    Boolean(hint?.intent) &&
      hintsFile.metadata?.source === "stage1-orca-bridge" &&
      Boolean(hintsFile.metadata?.target?.url?.includes("linear.app")),
    `composeHints from ${hintsFile.metadata?.target?.url} via ${hintsFile.metadata?.source}`,
  );

  const client = createFoundryMcpClient({ baseUrl, timeoutMs: 60_000 });

  // --- Seed: bridge hint -> live compose -> convert -> confirm-gate apply ----
  const compose1 = await client.designCompose({
    intent: hint.intent,
    layout: hint.layout,
  });
  const conversion1 = uiSchemaToDesignDocument(compose1.schema, {
    title: "Linear seed (Stage1)",
  });
  console.log(
    `  composed: layout=${compose1.layout} selections=[${compose1.selections
      .map((s) => `${s.slotName}:${s.selectedComponent}`)
      .join(", ")}]`,
  );

  useDocumentStateStore.getState().reset();
  useCommentStateStore.getState().reset();

  const seedArgs = {
    requestId: "gate2-seed",
    title: "Linear seed (Stage1)",
    document: conversion1.document,
    addressesCommentIds: [] as string[],
  };
  const seedOutcome = await confirmForgeRegenerate(seedArgs);
  check(
    "seed-applies-via-confirm-gate",
    seedOutcome.decision === "applied" &&
      seedOutcome.saved &&
      useDocumentStateStore.getState().document === conversion1.document,
    `decision=${seedOutcome.decision}, ${seedOutcome.componentCount} components in the active document`,
  );
  check(
    "seed-flagged-forge-composed",
    isForgeComposedDocument(useDocumentStateStore.getState().document),
    "active document carries the forge-composed tag (drives the entity-slot anchor flip)",
  );

  // --- Real render: the review surface the human comments on -----------------
  const render1 = await renderLive(client, conversion1.document);
  const anchors1 = extractAnchorPairs(render1.html);
  const labeled = anchors1.find((anchor) => anchor.label);
  check(
    "seed-renders-with-anchors",
    anchors1.length > 0 && Boolean(labeled),
    `${anchors1.length} anchored elements, first labeled: ${labeled?.label}`,
  );

  // --- The human pins critique on a real anchor (regenerate path -> durable) -
  const pinned = anchorFromPreview(labeled?.nodeId ?? null, labeled?.label ?? null, {
    preferDurable: isForgeComposedDocument(useDocumentStateStore.getState().document),
    ancestorLabel: null,
  });
  if (!pinned) {
    throw new Error("no anchor derivable from the rendered seed");
  }
  useCommentStateStore.getState().addComment(pinned, "gate2: make this section clearer");
  // A second comment the regenerate does NOT address — must stay open.
  useCommentStateStore
    .getState()
    .addComment({ kind: "instance", componentId: "not-a-real-node" }, "gate2: unrelated");
  const [addressed, unrelated] = useCommentStateStore.getState().comments;
  check(
    "comment-pinned-durably",
    addressed.anchor.kind === "entity-slot",
    `comment anchored as ${addressed.anchor.kind}:${addressed.anchor.slotLabel}`,
  );

  // --- The agent regenerates, addressing the comment (decision 122) ----------
  const compose2 = await client.designCompose({
    intent: hint.intent,
    layout: hint.layout,
  });
  const conversion2 = uiSchemaToDesignDocument(compose2.schema, {
    title: "Linear seed (regenerated)",
  });
  const regenArgs = {
    requestId: "gate2-regen",
    title: "Linear seed (regenerated)",
    document: conversion2.document,
    addressesCommentIds: [addressed.id],
  };
  const regenOutcome = await confirmForgeRegenerate(regenArgs);
  const link = forgeRegenerateCommentLink(regenArgs, regenOutcome);
  if (link) {
    useCommentStateStore.getState().resolveCommentsForChange(link);
  }
  const afterRegen = useCommentStateStore.getState().comments;
  check(
    "regenerate-resolves-addressed-comment",
    regenOutcome.decision === "applied" &&
      afterRegen.find((c) => c.id === addressed.id)?.resolved === true,
    "declared comment resolved on Accept (the m10 re-propose loop-breaker)",
  );
  check(
    "regenerate-keeps-unaddressed-comment-open",
    afterRegen.find((c) => c.id === unrelated.id)?.resolved === false,
    "undeclared comment stays open — a regenerate never silently closes critique",
  );

  // --- Reconcile remaining open comments against the regenerated document ----
  const open = useCommentStateStore.getState().comments.filter((c) => !c.resolved);
  const reconciliations = reconcileAnchorsAfterRegenerate(
    open,
    collectExpectedRegenerateAnchors(conversion2.document),
  );
  const repins = reconciliations.filter((entry) => entry.status === "repinned");
  if (repins.length > 0) {
    useCommentStateStore
      .getState()
      .reanchorComments(
        repins.map((entry) => ({ commentId: entry.commentId, anchor: entry.anchor })),
      );
  }
  const unrelatedRec = reconciliations.find((entry) => entry.commentId === unrelated.id);
  check(
    "reconciliation-orphans-conservatively",
    unrelatedRec?.status === "orphaned" &&
      useCommentStateStore.getState().comments.find((c) => c.id === unrelated.id)
        ?.resolved === false,
    "the unrelated instance comment orphans (detached + flagged), never silently resolved",
  );

  // --- Render the regenerated document — the loop closes visually ------------
  const render2 = await renderLive(client, conversion2.document);
  const anchors2 = extractAnchorPairs(render2.html);
  check(
    "regenerated-render-live",
    anchors2.length > 0,
    `regenerated document renders with ${anchors2.length} anchored elements`,
  );

  // --- Report -----------------------------------------------------------------
  const pass = checks.every((entry) => entry.pass);
  const reportPath = path.join("cmos", "reports", "sprint-21-m04-gate2-report.md");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    [
      "# s21-m04 Gate 2 — live Stage1 seed end-to-end (linear.app)",
      "",
      `- Date: ${new Date().toISOString()}`,
      `- Bridge: ${baseUrl}`,
      `- Stage1 run: ${hintsPath}`,
      `- Decision: **${pass ? "PASS" : "FAIL"}**`,
      "",
      "| check | result | detail |",
      "| --- | --- | --- |",
      ...checks.map(
        (entry) =>
          `| ${entry.id} | ${entry.pass ? "PASS" : "FAIL"} | ${entry.detail} |`,
      ),
      "",
    ].join("\n"),
  );
  console.log(`\nGate 2: ${pass ? "PASS" : "FAIL"} (report: ${reportPath})`);
  process.exit(pass ? 0 : 1);
};

main().catch((error) => {
  console.error("Gate 2 harness error:", error);
  process.exit(1);
});
