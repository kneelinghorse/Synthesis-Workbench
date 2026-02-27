import { expect, test, type Page } from "@playwright/test";

import {
  installMockServices,
  mockEmptyProjects,
  mockExistingProjects,
} from "./fixtures/mock-services";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const submitCommand = async (page: Page, command: string) => {
  const composer = page.getByLabel("Workbench composer");
  await expect(composer).toBeVisible();
  await composer.fill(command);

  const sendButton = page.locator("button:has(svg.lucide-send)").last();
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
};

const waitForDesignSave = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/designs"),
    { timeout: 30_000 }
  );

const readPreviewMarkers = async (page: Page) => {
  const frame = page.frameLocator('iframe[title="Preview"]');
  const body = frame.locator("body");
  await expect(body).toBeVisible();

  return body.evaluate((node) => ({
    foundryComponents: node.querySelectorAll("[data-component-id]").length,
    dryRunSummaries: node.querySelectorAll('[data-foundry-render="summary"]')
      .length,
    staticPreviews: node.querySelectorAll('[data-static-preview="true"]')
      .length,
    hasAnyContent: node.innerHTML.trim().length > 0,
  }));
};

// ---------------------------------------------------------------------------
// 1. Landing Page → /chat → ChatWorkbenchShell renders
// ---------------------------------------------------------------------------

test.describe("MVP Flow: Navigation", () => {
  test("landing page loads and navigates to /chat", async ({ page }) => {
    await installMockServices(page);
    await mockExistingProjects(page);

    // 1a. Landing page renders
    await page.goto("/");
    await expect(page.locator("h1")).toContainText(
      "Orchestrate Stage1 insights"
    );
    await expect(page.locator("text=Synthesis Workbench")).toBeVisible();

    // 1b. Click "Open Workbench" navigates to /chat
    const openButton = page.getByRole("link", { name: "Open Workbench" });
    await expect(openButton).toBeVisible();
    await openButton.click();

    // 1c. ChatWorkbenchShell renders — composer visible
    await page.waitForURL("**/chat");
    const composer = page.getByLabel("Workbench composer");
    await expect(composer).toBeVisible({ timeout: 15_000 });

    // 1d. Key workbench elements present
    await expect(page.locator("text=Preview Pane")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. FirstRunOnboarding appears on fresh state, steps are completable
// ---------------------------------------------------------------------------

test.describe("MVP Flow: Onboarding", () => {
  test("FirstRunOnboarding appears for new workspace and steps are completable", async ({
    page,
  }) => {
    await installMockServices(page);
    await mockEmptyProjects(page);

    await page.goto("/chat");
    const composer = page.getByLabel("Workbench composer");
    await expect(composer).toBeVisible({ timeout: 15_000 });

    // 2a. Onboarding section appears with "New workspace detected"
    await expect(page.locator("text=New workspace detected")).toBeVisible({
      timeout: 10_000,
    });

    // 2b. Dialog auto-opens for first-run
    const dialog = page.getByRole("dialog", {
      name: "First-run onboarding",
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // 2c. Step 1: Connect services
    await expect(dialog.locator("text=Connect services")).toBeVisible();
    await expect(dialog.locator("text=Step 1 of 5")).toBeVisible();

    // 2d. Service health badges appear (mocked as healthy)
    await expect(dialog.locator("text=Re-check services")).toBeVisible();

    // 2e. "Continue anyway" or "Next step" is clickable
    const nextButton = dialog.getByRole("button", { name: "Next step" });
    // In CI with mocked services, Foundry health might show as issue
    // since the onboarding checks use the real client. Use Continue anyway if needed.
    const continueAnywayButton = dialog.getByRole("button", {
      name: "Continue anyway",
    });
    if (await continueAnywayButton.isVisible().catch(() => false)) {
      await continueAnywayButton.click();
    } else {
      await nextButton.click();
    }

    // 2f. Step 2: Load a Stage1 bundle
    await expect(dialog.locator("text=Load a Stage1 bundle")).toBeVisible();

    // 2g. Skip through remaining steps
    await dialog.getByRole("button", { name: "Next step" }).click();
    await expect(dialog.locator("text=Adjust tokens")).toBeVisible();

    await dialog.getByRole("button", { name: "Next step" }).click();
    await expect(
      dialog.getByRole("heading", { name: "Render a component" })
    ).toBeVisible();

    // Step 4 → Step 5: Export the result
    await dialog.getByRole("button", { name: "Next step" }).click();
    await expect(
      dialog.getByRole("heading", { name: "Export the result" })
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Finish walkthrough" }).click();

    // 2h. Dialog dismissed
    await expect(dialog).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Compose flow: set_document → visible preview content
// ---------------------------------------------------------------------------

test.describe("MVP Flow: Compose", () => {
  test("template command produces visible preview content", async ({
    page,
  }) => {
    await installMockServices(page);
    await mockExistingProjects(page);

    await page.goto("/chat");
    const composer = page.getByLabel("Workbench composer");
    await expect(composer).toBeVisible({ timeout: 15_000 });

    // 3a. Submit a template command to set a design document
    const savePromise = waitForDesignSave(page);
    await submitCommand(page, "/doc template dashboard");

    // 3b. Verify the template was applied
    await expect(
      page.getByText('Applying built-in template "dashboard".')
    ).toBeVisible({ timeout: 15_000 });

    // 3c. Design persists to API
    const saveResponse = await savePromise;
    expect(saveResponse.ok()).toBe(true);

    // 3d. Preview panel shows rendered content (static or Foundry)
    await expect
      .poll(
        async () => {
          const markers = await readPreviewMarkers(page);
          return (
            markers.foundryComponents > 0 ||
            markers.staticPreviews > 0 ||
            markers.hasAnyContent
          );
        },
        { timeout: 15_000 }
      )
      .toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Export flow: export triggers download
// ---------------------------------------------------------------------------

test.describe("MVP Flow: Export", () => {
  test("export button triggers HTML download after composing a design", async ({
    page,
  }) => {
    await installMockServices(page);
    await mockExistingProjects(page);

    await page.goto("/chat");
    const composer = page.getByLabel("Workbench composer");
    await expect(composer).toBeVisible({ timeout: 30_000 });

    // 4a. First, set a document so export has content
    const savePromise = waitForDesignSave(page);
    await submitCommand(page, "/doc template dashboard");
    await expect(
      page.getByText('Applying built-in template "dashboard".')
    ).toBeVisible({ timeout: 15_000 });

    // Wait for the design to actually persist before attempting export
    await savePromise;

    // 4b. Click the export button (aria-label="Export design") to open Radix Popover
    const exportButton = page.getByRole("button", { name: "Export design" });
    await expect(exportButton).toBeEnabled({ timeout: 10_000 });
    await exportButton.click();

    // 4c. Wait for popover to open, then select HTML format
    // DesignExportButton uses plain <button> elements inside a Radix Popover (not menuitem)
    const htmlOption = page.locator("button").filter({ hasText: "HTML" }).filter({ hasText: "Standalone HTML" });
    await expect(htmlOption).toBeVisible({ timeout: 5_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await htmlOption.click();

    // 4d. Verify download triggered
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.html$/);
  });
});
