import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { renderDocument } from "../src/lib/engine/composition-renderer";
import { createFoundryMcpClient } from "../src/lib/mcp/foundry-client";
import {
  BUILT_IN_TEMPLATE_SLUGS,
  applyBuiltInTemplate,
} from "../src/lib/templates/built-in-library";

type TemplateVerification = {
  slug: string;
  title: string;
  componentCount: number;
  hasErrorFallback: boolean;
  errorCount: number;
  oodsMarkerCount: number;
  failedRefs: string[];
  errorMessages: string[];
  refs: string[];
  htmlSnippet: string;
  attempts: number;
  rateLimitRetry: boolean;
};

const baseUrl =
  process.env.OODS_FOUNDRY_MCP_URL?.trim() ||
  process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL?.trim() ||
  "http://127.0.0.1:4466/run";

const RATE_LIMIT_COOLDOWN_MS = 65_000;
const MAX_TEMPLATE_ATTEMPTS = 3;

const toSnippet = (value: string, max = 160) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 3)}...`;
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const hasRateLimitError = (messages: string[]) =>
  messages.some((message) => /too many requests|rate.?limit/i.test(message));

const run = async () => {
  const client = createFoundryMcpClient({ baseUrl });
  const checks: TemplateVerification[] = [];

  for (const slug of BUILT_IN_TEMPLATE_SLUGS) {
    const document = applyBuiltInTemplate(slug);

    let composed = await renderDocument(document, client);
    let attempts = 1;
    let rateLimitRetry = false;

    while (attempts < MAX_TEMPLATE_ATTEMPTS) {
      const messages = composed.errors.map((error) => error.message);
      if (!hasRateLimitError(messages)) {
        break;
      }

      rateLimitRetry = true;
      attempts += 1;
      await sleep(RATE_LIMIT_COOLDOWN_MS);
      composed = await renderDocument(document, client);
    }

    const failedComponents = composed.components.filter(
      (component) =>
        Boolean(component.error) ||
        component.html.includes('data-component-error="true"')
    );

    const oodsMarkerCount =
      composed.html.match(/data-oods-component=/g)?.length ?? 0;

    checks.push({
      slug,
      title: document.metadata.title,
      componentCount: composed.components.length,
      hasErrorFallback: failedComponents.length > 0,
      errorCount: composed.errors.length,
      oodsMarkerCount,
      failedRefs: failedComponents.map((component) => component.ref),
      errorMessages: composed.errors.map((error) => error.message),
      refs: composed.components.map((component) => component.ref),
      htmlSnippet: toSnippet(composed.html),
      attempts,
      rateLimitRetry,
    });
  }

  const generatedAt = new Date().toISOString();
  const allPassed = checks.every(
    (check) => !check.hasErrorFallback && check.errorCount === 0
  );

  const lines: string[] = [];
  lines.push("# Foundry Template Verification");
  lines.push("");
  lines.push(`- Generated: ${generatedAt}`);
  lines.push(`- Foundry endpoint: ${baseUrl}`);
  lines.push(`- Overall result: ${allPassed ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("| Template | Components | Errors | Error Fallbacks | OODS HTML markers | Attempts | Result |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- |");

  for (const check of checks) {
    const result =
      check.errorCount === 0 && !check.hasErrorFallback ? "PASS" : "FAIL";

    lines.push(
      `| ${check.slug} | ${check.componentCount} | ${check.errorCount} | ${
        check.hasErrorFallback ? "yes" : "no"
      } | ${check.oodsMarkerCount} | ${check.attempts} | ${result} |`
    );
  }

  for (const check of checks) {
    lines.push("");
    lines.push(`## ${check.slug}`);
    lines.push("");
    lines.push(`- Title: ${check.title}`);
    lines.push(`- Component refs: ${check.refs.join(", ")}`);
    lines.push(`- Errors: ${check.errorCount}`);
    lines.push(
      `- Error fallbacks: ${check.hasErrorFallback ? check.failedRefs.join(", ") : "none"}`
    );
    lines.push(`- Rate limit retry used: ${check.rateLimitRetry ? "yes" : "no"}`);
    lines.push(`- OODS marker count in output HTML: ${check.oodsMarkerCount}`);
    if (check.errorMessages.length > 0) {
      lines.push(`- Error messages: ${check.errorMessages.join(" | ")}`);
    }
    lines.push(`- Render snippet: \`${check.htmlSnippet}\``);
  }

  const outputDir = path.resolve(process.cwd(), "docs", "verification");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "foundry-template-render-log.md");
  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");

  process.stdout.write(`${outputPath}\n`);

  if (!allPassed) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Foundry template verification failed: ${message}\n`);
  process.exit(1);
});
