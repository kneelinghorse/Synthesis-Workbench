import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { collectComponents } from "../src/lib/engine/composition-renderer";
import { getPreviewRenderer } from "../src/lib/engine/preview-renderer";
import { createFoundryMcpClient } from "../src/lib/mcp/foundry-client";
import { applyBuiltInTemplate } from "../src/lib/templates/built-in-library";

type TemplateSlug = "dashboard" | "form-page" | "landing-page";

type TemplateParityRow = {
  slug: TemplateSlug;
  sourceComponentCount: number;
  fullDocumentMarkers: number;
  fragmentMarkers: number;
  fragmentWrappers: number;
  fullDocumentErrors: number;
  fragmentErrors: number;
  fullDocumentFoundryStatus: string;
  fragmentFoundryStatus: string;
  fragmentCollapsed: boolean;
  parityPass: boolean;
};

const BASELINE_TEMPLATES: TemplateSlug[] = [
  "dashboard",
  "form-page",
  "landing-page",
];

const baseUrl =
  process.env.OODS_FOUNDRY_MCP_URL?.trim() ||
  process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL?.trim() ||
  "http://127.0.0.1:4466/run";

const countMatches = (value: string, pattern: RegExp): number =>
  value.match(pattern)?.length ?? 0;

const run = async () => {
  const client = createFoundryMcpClient({ baseUrl });
  const fullDocumentRenderer = getPreviewRenderer("full-document");
  const fragmentRenderer = getPreviewRenderer("fragments");

  const rows: TemplateParityRow[] = [];

  for (const slug of BASELINE_TEMPLATES) {
    const document = applyBuiltInTemplate(slug);
    const sourceComponentCount = collectComponents(document.root).length;

    const [fullDocumentResult, fragmentResult] = await Promise.all([
      fullDocumentRenderer.render(document, client),
      fragmentRenderer.render(document, client),
    ]);

    const fullDocumentMarkers = countMatches(
      fullDocumentResult.html,
      /data-oods-component=/g,
    );
    const fragmentMarkers = countMatches(
      fragmentResult.html,
      /data-oods-component=/g,
    );
    const fragmentWrappers = countMatches(
      fragmentResult.html,
      /data-component-id=/g,
    );
    const fragmentCollapsed = fragmentMarkers <= 1;

    const parityPass =
      fullDocumentResult.errors.length === 0 &&
      fragmentResult.errors.length === 0 &&
      !fragmentCollapsed &&
      fragmentWrappers === sourceComponentCount &&
      fragmentResult.foundryStatus === "live";

    rows.push({
      slug,
      sourceComponentCount,
      fullDocumentMarkers,
      fragmentMarkers,
      fragmentWrappers,
      fullDocumentErrors: fullDocumentResult.errors.length,
      fragmentErrors: fragmentResult.errors.length,
      fullDocumentFoundryStatus: fullDocumentResult.foundryStatus,
      fragmentFoundryStatus: fragmentResult.foundryStatus,
      fragmentCollapsed,
      parityPass,
    });
  }

  const allPassed = rows.every((row) => row.parityPass);
  const generatedAt = new Date().toISOString();

  const lines: string[] = [];
  lines.push("# Sprint-13 Fragment Preview Parity Verification");
  lines.push("");
  lines.push("## Run Metadata");
  lines.push(`- Date: ${generatedAt.slice(0, 10)}`);
  lines.push(`- Foundry endpoint: \`${baseUrl}\``);
  lines.push(`- Baseline templates: ${BASELINE_TEMPLATES.join(", ")}`);
  lines.push(`- Overall result: ${allPassed ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("## Parity Table");
  lines.push("");
  lines.push(
    "| Template | Source components | Full markers | Fragment markers | Fragment wrappers | Full errors | Fragment errors | Full status | Fragment status | Fragment collapsed | Result |",
  );
  lines.push(
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |",
  );

  for (const row of rows) {
    lines.push(
      `| ${row.slug} | ${row.sourceComponentCount} | ${row.fullDocumentMarkers} | ${row.fragmentMarkers} | ${row.fragmentWrappers} | ${row.fullDocumentErrors} | ${row.fragmentErrors} | ${row.fullDocumentFoundryStatus} | ${row.fragmentFoundryStatus} | ${row.fragmentCollapsed ? "yes" : "no"} | ${row.parityPass ? "PASS" : "FAIL"} |`,
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- Fragment parity requires no fragment renderer errors, non-collapsed output, and wrapper coverage matching source component count.",
  );
  lines.push(
    "- This validates adapter parity for sprint-13 baseline templates while full-document mode remains available as rollback.",
  );

  const outputDir = path.resolve(process.cwd(), "docs", "verification");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "s13-fragment-parity.md");
  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");

  process.stdout.write(`${outputPath}\n`);
  process.stdout.write(`Overall result: ${allPassed ? "PASS" : "FAIL"}\n`);

  if (!allPassed) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fragment parity verification failed: ${message}\n`);
  process.exit(1);
});
