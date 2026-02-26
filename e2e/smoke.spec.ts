import { expect, test, type Page } from "@playwright/test";

import {
  SMOKE_PERSISTED_SLUG,
  SMOKE_TEMPLATE_COMMAND,
} from "./fixtures/sample-document";

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

const deletePersistedDesign = async (page: Page, slug: string) => {
  const response = await page.request.delete(
    `/api/designs?slug=${encodeURIComponent(slug)}&confirm=true`
  );

  if (response.status() === 404) {
    return;
  }

  expect(response.ok()).toBe(true);
};

const readPreviewMarkers = async (page: Page) => {
  const frame = page.frameLocator('iframe[title="Preview"]');
  const body = frame.locator("body");
  await expect(body).toBeVisible();

  return body.evaluate((node) => ({
    foundryComponents: node.querySelectorAll("[data-component-id]").length,
    dryRunSummaries: node.querySelectorAll('[data-foundry-render="summary"]').length,
    staticPreviews: node.querySelectorAll('[data-static-preview="true"]').length,
  }));
};

const expectRenderedPreview = async (page: Page) => {
  await expect
    .poll(async () => {
      const markers = await readPreviewMarkers(page);
      return markers.foundryComponents > 0 || markers.staticPreviews > 0;
    })
    .toBe(true);

  const markers = await readPreviewMarkers(page);
  if (markers.foundryComponents > 0) {
    expect(markers.dryRunSummaries).toBe(0);
  } else {
    expect(markers.staticPreviews).toBeGreaterThan(0);
  }
};

test.describe("template -> preview -> persist smoke", () => {
  test("persists a template design and reloads it after page refresh", async ({
    page,
  }) => {
    await deletePersistedDesign(page, SMOKE_PERSISTED_SLUG);

    try {
      await page.goto("/chat");

      const saveResponsePromise = waitForDesignSave(page);
      await submitCommand(page, SMOKE_TEMPLATE_COMMAND);
      await expect(page.getByText('Applying built-in template "dashboard".')).toBeVisible();

      const saveResponse = await saveResponsePromise;
      expect(saveResponse.ok()).toBe(true);
      const savePayload = (await saveResponse.json()) as {
        saved?: boolean;
        slug?: string;
      };
      expect(savePayload.saved).toBe(true);
      expect(savePayload.slug).toBe(SMOKE_PERSISTED_SLUG);
      await expectRenderedPreview(page);

      await page.reload();
      await expect(page.getByLabel("Workbench composer")).toBeVisible();

      await expect
        .poll(async () => {
          const response = await page.request.get(
            `/api/designs?slug=${encodeURIComponent(SMOKE_PERSISTED_SLUG)}`
          );
          if (!response.ok()) {
            return null;
          }

          const payload = (await response.json()) as {
            loaded?: boolean;
            slug?: string;
          };
          return payload.loaded === true ? payload.slug ?? null : null;
        }, { timeout: 30_000 })
        .toBe(SMOKE_PERSISTED_SLUG);
    } finally {
      await deletePersistedDesign(page, SMOKE_PERSISTED_SLUG);
    }
  });
});
