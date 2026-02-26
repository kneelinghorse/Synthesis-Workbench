import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "node:url";

import { GET as getProjects, POST as postProjects } from "../src/app/api/projects/route";
import { POST as postDesigns } from "../src/app/api/designs/route";
import type { DesignDocument } from "../src/types/document-model";
import { DEFAULT_TOKEN_STATE } from "../src/types/token-state";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const TEST_BASE_DIR = path.join(PROJECT_ROOT, "test-api-projects-route-tmp");
const PREVIOUS_CWD = process.cwd();

const SAMPLE_DOC: DesignDocument = {
  metadata: { title: "Project Home" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 16 },
    children: [
      {
        nodeType: "component",
        id: "hero",
        ref: "oods:Card",
        props: { title: "Hero" },
      },
    ],
  },
};

describe("/api/projects route", () => {
  beforeEach(async () => {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
    process.chdir(TEST_BASE_DIR);
  });

  afterEach(async () => {
    process.chdir(PREVIOUS_CWD);
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
  });

  it("creates and lists projects", async () => {
    const createResponse = await postProjects(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Workspace Alpha" }),
      })
    );
    const createPayload = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(createPayload.created).toBe(true);
    expect(createPayload.project.slug).toBe("workspace-alpha");

    const listResponse = await getProjects(
      new Request("http://localhost/api/projects")
    );
    const listPayload = await listResponse.json();

    expect(listResponse.status).toBe(200);
    expect(listPayload.count).toBe(1);
    expect(listPayload.projects[0].name).toBe("Workspace Alpha");
    expect(listPayload.projects[0].designCount).toBe(0);
  });

  it("opens project workspace and restores active design state", async () => {
    await postProjects(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Workspace Beta", slug: "workspace-beta" }),
      })
    );

    await postDesigns(
      new Request("http://localhost/api/designs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectSlug: "workspace-beta",
          slug: "home",
          document: SAMPLE_DOC,
          tokenState: {
            values: {
              ...DEFAULT_TOKEN_STATE,
              custom: {
                "brand.outline": "1px solid #333",
              },
            },
            changes: {
              "custom.brand.outline": {
                from: "",
                to: "1px solid #333",
              },
            },
            history: [],
          },
        }),
      })
    );

    const openResponse = await getProjects(
      new Request("http://localhost/api/projects?slug=workspace-beta")
    );
    const openPayload = await openResponse.json();

    expect(openResponse.status).toBe(200);
    expect(openPayload.project.slug).toBe("workspace-beta");
    expect(openPayload.workspace.activeDesignSlug).toBe("home");
    expect(openPayload.workspace.workspace.document.metadata.title).toBe(
      "Project Home"
    );
    expect(
      openPayload.workspace.workspace.tokenState.values.custom["brand.outline"]
    ).toBe("1px solid #333");
  });
});
