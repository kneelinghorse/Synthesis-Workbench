import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:3000";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "cmos",
  "evidence",
  "s17-m04",
);
const PREVIEW_SCREENSHOT = path.join(EVIDENCE_DIR, "preview-panel-screenshot.png");
const EXPORTED_HTML_SCREENSHOT = path.join(
  EVIDENCE_DIR,
  "exported-html-screenshot.png",
);
const EXPORTED_HTML_FILE = path.join(EVIDENCE_DIR, "dashboard-starter-export.html");
const SUMMARY_FILE = path.join(EVIDENCE_DIR, "walkthrough-summary.md");

const CANONICAL_WARNING =
  "Foundry did not return canonical tokens for this theme (skipping sync).";

const requiredPreviewText = [
  "Workbench Overview",
  "Track pipeline health, adoption, and delivery metrics.",
  "Overview",
  "Pipeline",
  "Team",
  "Active users",
  "1,240",
  "+12%",
  "Revenue",
  "$42k",
  "+8%",
  "Conversion",
  "3.8%",
  "+0.4%",
  "Metric",
  "Value",
  "Delta",
  "Sessions",
  "Template applies",
  "A11y pass rate",
  "View full report",
];

const requiredExportText = [
  "Workbench Overview",
  "Active users",
  "Revenue",
  "Conversion",
  "View full report",
];

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const requireIncludes = (
  haystack: string,
  needle: string,
  failure: string[],
  context: string,
) => {
  if (!haystack.includes(needle)) {
    failure.push(`${context} missing required content: "${needle}"`);
  }
};

const run = async () => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Open Workbench" }).click();
    await page.waitForURL("**/chat", { timeout: 30_000 });

    const composer = page.getByLabel("Workbench composer");
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    await composer.fill("/doc template dashboard");

    const sendButton = page.locator("button:has(svg.lucide-send)").last();
    await sendButton.waitFor({ state: "visible", timeout: 10_000 });
    await sendButton.click();

    await page
      .getByText('Applying built-in template "dashboard".')
      .waitFor({ state: "visible", timeout: 20_000 });

    await page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/designs"),
      { timeout: 30_000 },
    );

    const frame = page.frameLocator('iframe[title="Preview"]');
    const previewBody = frame.locator("body");
    await previewBody.waitFor({ state: "visible", timeout: 15_000 });

    await page.waitForTimeout(1_000);

    const previewHtml = await previewBody.evaluate((node) => node.innerHTML);
    const previewText = await previewBody.evaluate(
      (node) => node.textContent ?? "",
    );
    const pageText = await page.locator("body").innerText();

    const failures: string[] = [];

    for (const text of requiredPreviewText) {
      requireIncludes(previewText, text, failures, "Preview");
    }

    if (pageText.includes(CANONICAL_WARNING)) {
      failures.push("Preview page still shows canonical token warning.");
    }

    if (previewHtml.includes('data-static-preview="true"')) {
      failures.push("Preview HTML indicates static fallback mode.");
    }

    if (
      /<article[^>]*data-oods-component="Card"[^>]*><\/article>/i.test(previewHtml)
    ) {
      failures.push("Preview still contains empty Card fragment shells.");
    }

    await page.screenshot({ path: PREVIEW_SCREENSHOT, fullPage: true });

    const exportButton = page.getByRole("button", { name: "Export design" });
    await exportButton.waitFor({ state: "visible", timeout: 10_000 });
    await exportButton.click();

    const htmlOption = page
      .locator("button")
      .filter({ hasText: "HTML" })
      .filter({ hasText: "Standalone HTML" });
    await htmlOption.waitFor({ state: "visible", timeout: 10_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
    await htmlOption.click();
    const download = await downloadPromise;
    await download.saveAs(EXPORTED_HTML_FILE);

    const exportedHtmlContent = await readFile(EXPORTED_HTML_FILE, "utf8");
    for (const text of requiredExportText) {
      requireIncludes(exportedHtmlContent, text, failures, "Exported HTML");
    }

    if (
      /<article[^>]*data-oods-component="Card"[^>]*><\/article>/i.test(
        exportedHtmlContent,
      )
    ) {
      failures.push("Exported HTML still contains empty Card fragment shells.");
    }

    const exportedPage = await context.newPage();
    await exportedPage.goto(`file://${EXPORTED_HTML_FILE}`, {
      waitUntil: "domcontentloaded",
    });
    await exportedPage.waitForTimeout(500);
    await exportedPage.screenshot({
      path: EXPORTED_HTML_SCREENSHOT,
      fullPage: true,
    });
    await exportedPage.close();

    const summaryLines = [
      "# S17-M04 Walkthrough Summary",
      "",
      `Date: ${new Date().toISOString()}`,
      `Workbench URL: ${BASE_URL}`,
      "",
      "## Acceptance Checks",
      `- Required preview content present: ${failures.some((entry) => entry.startsWith("Preview missing")) ? "NO" : "YES"}`,
      `- Canonical token warning absent: ${pageText.includes(CANONICAL_WARNING) ? "NO" : "YES"}`,
      `- Static fallback indicator absent: ${previewHtml.includes('data-static-preview="true"') ? "NO" : "YES"}`,
      `- Empty card shells absent in preview: ${
        /<article[^>]*data-oods-component="Card"[^>]*><\/article>/i.test(previewHtml)
          ? "NO"
          : "YES"
      }`,
      `- Required export content present: ${failures.some((entry) => entry.startsWith("Exported HTML missing")) ? "NO" : "YES"}`,
      `- Empty card shells absent in export: ${
        /<article[^>]*data-oods-component="Card"[^>]*><\/article>/i.test(
          exportedHtmlContent,
        )
          ? "NO"
          : "YES"
      }`,
      "",
      "## Evidence Files",
      "- preview-panel-screenshot.png",
      "- exported-html-screenshot.png",
      "- dashboard-starter-export.html",
      "",
      "## Notes",
      failures.length > 0 ? failures.map((entry) => `- FAIL: ${entry}`).join("\n") : "- All automated checks passed.",
      "",
      "## Human Sign-off",
      "- Pending user review of screenshot evidence.",
    ];

    await writeFile(SUMMARY_FILE, `${summaryLines.join("\n")}\n`, "utf8");

    process.stdout.write(
      `${JSON.stringify(
        {
          previewScreenshot: PREVIEW_SCREENSHOT,
          exportedScreenshot: EXPORTED_HTML_SCREENSHOT,
          exportedHtml: EXPORTED_HTML_FILE,
          summary: SUMMARY_FILE,
          failureCount: failures.length,
          failures,
        },
        null,
        2,
      )}\n`,
    );

    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await context.close();
    await browser.close();
  }
};

run().catch((error) => {
  process.stderr.write(`S17 acceptance capture failed: ${toMessage(error)}\n`);
  process.exit(1);
});
