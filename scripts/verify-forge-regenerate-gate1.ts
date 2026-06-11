/**
 * s21-m04 ACCEPTANCE GATE 1 (decision 134 — live, not faked).
 *
 * Proves against the LIVE local Forge bridge that an anchored comment survives
 * a real Forge regenerate:
 *   1. design_compose seed A -> UiSchema -> DesignDocument -> REAL fragments
 *      render -> extract the actual data-oods-node-id / data-oods-label pairs
 *      from the rendered HTML.
 *   2. Pin two comments: a durable entity-slot anchor (decision 119) and an
 *      instance-only anchor.
 *   3. design_compose seed B with a STRUCTURAL change (more sections) -> render
 *      -> extract the regenerated anchors.
 *   4. Reconcile: the durable-label comment must NOT orphan; the instance-only
 *      anchor MUST orphan once Forge re-mints its `${slot}-${counter}` id —
 *      which is exactly why decision 119 flips the regenerate path to
 *      entity-slot anchors.
 *   5. Cross-check collectExpectedRegenerateAnchors (what reconciliation runs
 *      on at Accept time) against the anchors actually present in the rendered
 *      HTML — the unit-level mirror must match live reality.
 *
 * Usage: npx tsx scripts/verify-forge-regenerate-gate1.ts
 * Env:   OODS_FOUNDRY_MCP_URL (default http://127.0.0.1:4466/run)
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildFoundryFragmentRenderInput,
  composeDocumentFromFoundryFragments,
  parseFoundryFragmentRenderOutput,
} from "../src/lib/engine/foundry-fragment-adapter";
import { uiSchemaToDesignDocument } from "../src/lib/engine/foundry-compose-adapter";
import { createFoundryMcpClient } from "../src/lib/mcp/foundry-client";
import {
  collectExpectedRegenerateAnchors,
  reconcileAnchorsAfterRegenerate,
  type RegeneratePreviewAnchor,
} from "../src/lib/runtime/tools/forge-regenerate-tools";
import type { Comment } from "../src/lib/stores/comment-state";
import type { DesignDocument } from "../src/types/document-model";

const DEFAULT_BASE_URL = "http://127.0.0.1:4466/run";

const baseUrl =
  process.env.OODS_FOUNDRY_MCP_URL?.trim() ||
  process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL?.trim() ||
  DEFAULT_BASE_URL;

// The structural pair: Forge's templates are intent-stable (probed live: a
// landing intent asking for five sections still composes three), so the REAL
// structural change comes from a template parameter. The form template's
// fieldGroups inserts groups UPSTREAM of the submit node, shifting its
// `${slot}-${counter}` id (form-submit-8 -> form-submit-12) while the durable
// "title" label persists — exactly the regenerate shape decision 141 documents.
const INTENT = "Settings form with grouped fields and a submit action";
const SEED_A = {
  intent: INTENT,
  layout: "form",
  preferences: { fieldGroups: 2 },
};
const SEED_B = {
  intent: INTENT,
  layout: "form",
  preferences: { fieldGroups: 4 },
};
const DURABLE_LABEL = "title";

type CheckResult = { id: string; pass: boolean; detail: string };

const checks: CheckResult[] = [];
const check = (id: string, pass: boolean, detail: string) => {
  checks.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id} — ${detail}`);
};

/** Extract (nodeId, label) pairs from every anchored element tag in the HTML. */
const extractAnchorsFromHtml = (html: string): RegeneratePreviewAnchor[] => {
  const anchors: RegeneratePreviewAnchor[] = [];
  const tagRe = /<[a-zA-Z][^>]*\bdata-oods-(?:node-id|label)="[^>]*>/g;
  for (const tag of html.match(tagRe) ?? []) {
    const nodeId = tag.match(/\bdata-oods-node-id="([^"]*)"/)?.[1] ?? null;
    const label = tag.match(/\bdata-oods-label="([^"]*)"/)?.[1] ?? null;
    anchors.push({ nodeId, label, ancestorLabel: null });
  }
  return anchors;
};

const pairKey = (anchor: RegeneratePreviewAnchor) =>
  `${anchor.nodeId ?? ""}|${anchor.label ?? ""}`;

const openComment = (id: string, anchor: Comment["anchor"]): Comment => ({
  id,
  anchor,
  text: `gate-1 ${id}`,
  createdAt: new Date().toISOString(),
  resolved: false,
});

const composeAndRender = async (
  client: ReturnType<typeof createFoundryMcpClient>,
  seed: { intent: string; layout: string; preferences?: Record<string, unknown> },
  label: string,
): Promise<{
  document: DesignDocument;
  liveAnchors: RegeneratePreviewAnchor[];
  componentIds: string[];
  labels: string[];
}> => {
  const compose = await client.designCompose(seed);
  const { document, warnings } = uiSchemaToDesignDocument(compose.schema, {
    title: `gate1-${label}`,
  });
  if (warnings.length > 0) {
    console.log(`  (${label}) conversion warnings: ${warnings.join(" | ")}`);
  }

  const { renderInput, componentIndex } = buildFoundryFragmentRenderInput(document);
  const rendered = await client.render(renderInput);
  const parsed = parseFoundryFragmentRenderOutput(rendered.raw, componentIndex);
  const composed = composeDocumentFromFoundryFragments(document, parsed);
  if (composed.errors.length > 0) {
    console.log(
      `  (${label}) compose errors: ${composed.errors
        .map((entry) => `${entry.componentId}: ${entry.message}`)
        .join(" | ")}`,
    );
  }

  const expected = collectExpectedRegenerateAnchors(document);
  return {
    document,
    liveAnchors: extractAnchorsFromHtml(composed.html),
    componentIds: expected.map((anchor) => anchor.nodeId ?? ""),
    labels: expected
      .map((anchor) => anchor.label)
      .filter((value): value is string => Boolean(value)),
  };
};

const main = async () => {
  console.log(`Gate 1 — live Forge regenerate anchor survival (${baseUrl})\n`);
  const client = createFoundryMcpClient({ baseUrl, timeoutMs: 60_000 });

  // --- Seed A: compose, render, capture real anchors -------------------------
  const a = await composeAndRender(client, SEED_A, "seed-a");
  console.log(
    `  seed A: ${a.componentIds.length} components [${a.componentIds.join(", ")}]`,
  );

  check(
    "a-node-ids-rendered",
    a.componentIds.every((id) =>
      a.liveAnchors.some((anchor) => anchor.nodeId === id),
    ),
    "every converted component id is present as data-oods-node-id in the rendered HTML",
  );
  check(
    "a-labels-rendered",
    a.labels.length > 0 &&
      a.labels.every((slotLabel) =>
        a.liveAnchors.some((anchor) => anchor.label === slotLabel),
      ),
    `every composed meta.label reached the DOM as data-oods-label (${a.labels.join(", ")})`,
  );

  // --- Pin the two comments the gate is about --------------------------------
  // What the comment layer creates on the regenerate path (decision 119):
  const durable = openComment("durable-label", {
    kind: "entity-slot",
    slotLabel: DURABLE_LABEL,
  });
  // The fragile v1 anchor, pinned to the node DOWNSTREAM of the structural
  // change (the submit button, whose counter the added field groups shift):
  const fragileTargetId = a.componentIds[a.componentIds.length - 1];
  const fragile = openComment("fragile-instance", {
    kind: "instance",
    componentId: fragileTargetId,
  });
  console.log(
    `\n  pinned: entity-slot "${DURABLE_LABEL}" + instance "${fragileTargetId}"\n`,
  );

  // --- Seed B: the REAL regenerate with a structural change -------------------
  const b = await composeAndRender(client, SEED_B, "seed-b");
  console.log(
    `  seed B: ${b.componentIds.length} components [${b.componentIds.join(", ")}]`,
  );

  check(
    "b-structural-change",
    b.componentIds.length !== a.componentIds.length,
    `component count changed ${a.componentIds.length} -> ${b.componentIds.length} (the counter-shifting structural change)`,
  );
  check(
    "b-instance-id-reminted",
    !b.componentIds.includes(fragileTargetId),
    `Forge re-minted the instance id ("${fragileTargetId}" absent from seed B) — the documented fragility`,
  );

  // The expected-anchor mirror must match what the live render actually emits
  // (reconciliation at Accept time runs on the mirror, so it must be truthful).
  const liveLabeled = new Set(
    b.liveAnchors.filter((anchor) => anchor.nodeId ?? anchor.label).map(pairKey),
  );
  const expectedB = collectExpectedRegenerateAnchors(b.document);
  check(
    "b-expected-anchors-match-live",
    expectedB.every((anchor) => liveLabeled.has(pairKey(anchor))),
    "collectExpectedRegenerateAnchors pairs all present in the live rendered HTML",
  );

  // --- The gate itself: reconcile against the regenerated anchors ------------
  const results = reconcileAnchorsAfterRegenerate([durable, fragile], b.liveAnchors);
  const durableResult = results.find((entry) => entry.commentId === "durable-label");
  const fragileResult = results.find((entry) => entry.commentId === "fragile-instance");

  check(
    "gate1-durable-survives",
    durableResult !== undefined && durableResult.status !== "orphaned",
    `entity-slot "${DURABLE_LABEL}" -> ${durableResult?.status} (must NOT orphan)`,
  );
  check(
    "gate1-instance-orphans",
    fragileResult?.status === "orphaned",
    `instance "${fragileTargetId}" -> ${fragileResult?.status} (the m03 finding that motivates decision 119)`,
  );

  // --- Report -----------------------------------------------------------------
  const pass = checks.every((entry) => entry.pass);
  const reportPath = path.join("cmos", "reports", "sprint-21-m04-gate1-report.md");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    [
      "# s21-m04 Gate 1 — live Forge regenerate anchor survival",
      "",
      `- Date: ${new Date().toISOString()}`,
      `- Bridge: ${baseUrl}`,
      `- Decision: **${pass ? "PASS" : "FAIL"}**`,
      "",
      "| check | result | detail |",
      "| --- | --- | --- |",
      ...checks.map(
        (entry) =>
          `| ${entry.id} | ${entry.pass ? "PASS" : "FAIL"} | ${entry.detail} |`,
      ),
      "",
      `Seed A components: ${a.componentIds.join(", ")}`,
      "",
      `Seed B components: ${b.componentIds.join(", ")}`,
      "",
    ].join("\n"),
  );
  console.log(`\nGate 1: ${pass ? "PASS" : "FAIL"} (report: ${reportPath})`);
  process.exit(pass ? 0 : 1);
};

main().catch((error) => {
  console.error("Gate 1 harness error:", error);
  process.exit(1);
});
