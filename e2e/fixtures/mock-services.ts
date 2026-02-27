import type { Page, Route } from "@playwright/test";

/**
 * Mock Foundry and Stage1 API responses for CI mode.
 *
 * Uses Playwright's page.route() to intercept API calls so E2E tests
 * pass without external services running.
 */

const MOCK_FOUNDRY_HEALTH = {
  status: "online",
  latencyMs: 5,
};

const MOCK_STAGE1_HEALTH = { ok: true };

const MOCK_FOUNDRY_MANIFEST = {
  dataset: "manifest",
  version: "1.0.0",
  generatedAt: new Date().toISOString(),
  etag: "mock-etag",
  matched: true,
  payloadIncluded: false,
  path: "manifest.json",
  manifestPath: null,
  sizeBytes: 0,
  schemaValidated: true,
};

const MOCK_STAGE1_RUNS = {
  runs: [],
  count: 0,
};

const jsonResponse = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

/**
 * Install mock API route handlers on a Playwright page.
 * Call once per test or in a beforeEach.
 */
export async function installMockServices(page: Page) {
  // Foundry health proxy
  await page.route("**/api/foundry/health", (route) =>
    jsonResponse(route, MOCK_FOUNDRY_HEALTH)
  );

  // Foundry run proxy (render/validate/tokens) — return minimal success
  await page.route("**/api/foundry/run", (route) =>
    jsonResponse(route, {
      ok: true,
      result: {
        html: '<div data-static-preview="true">Mock Foundry render</div>',
        status: "ok",
      },
    })
  );

  // Foundry MCP proxy
  await page.route("**/api/foundry/mcp", (route) =>
    jsonResponse(route, {
      jsonrpc: "2.0",
      id: "mock",
      result: { content: [{ type: "text", text: "{}" }] },
    })
  );

  // Stage1 MCP proxy
  await page.route("**/api/stage1/mcp", (route) =>
    jsonResponse(route, MOCK_STAGE1_RUNS)
  );
}

/**
 * Clear projects to simulate a fresh workspace for onboarding tests.
 */
export async function mockEmptyProjects(page: Page) {
  await page.route("**/api/projects", (route) => {
    if (route.request().method() === "GET") {
      return jsonResponse(route, { projects: [], count: 0 });
    }
    return route.continue();
  });
}

/**
 * Mock projects API to return existing projects (skip onboarding auto-open).
 */
export async function mockExistingProjects(page: Page) {
  await page.route("**/api/projects", (route) => {
    if (route.request().method() === "GET") {
      return jsonResponse(route, {
        projects: [{ id: "test", name: "Test Project" }],
        count: 1,
      });
    }
    return route.continue();
  });
}
