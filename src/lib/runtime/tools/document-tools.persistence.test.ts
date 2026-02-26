import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/designs/route";
import { createProject } from "@/lib/persistence/project-catalog";
import { useDataContextStore } from "@/lib/stores/data-context";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import { useProjectStateStore } from "@/lib/stores/project-state";
import { useTokenStateStore } from "@/lib/stores/token-state";
import type { DesignDocument } from "@/types/document-model";
import { executeSetDocument } from "./document-tools";

const createDocument = (title: string, componentId: string): DesignDocument => ({
  metadata: { title },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 12 },
    children: [
      {
        nodeType: "component",
        id: componentId,
        ref: "oods:Text",
        props: { content: title },
      },
    ],
  },
});

const createApiUrl = (pathnameWithQuery: string) =>
  new URL(pathnameWithQuery, "http://localhost").toString();

describe("executeSetDocument persistence", () => {
  const originalCwd = process.cwd();
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "synthesis-doc-persist-"));
    process.chdir(tempDir);

    useProjectStateStore.getState().reset();
    useDocumentStateStore.getState().reset();
    useDataContextStore.getState().reset();
    usePreviewStateStore.getState().reset();
    useTokenStateStore.getState().resetAll();

    await createProject({
      name: "Test Project",
      slug: "test-project",
      baseDir: tempDir,
    });

    const fetchBridge = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = (init?.method ?? "GET").toUpperCase();
      const request = new Request(url.toString(), {
        method,
        headers: init?.headers,
        body: init?.body,
      });

      if (url.pathname === "/api/designs" && method === "POST") {
        return POST(request);
      }
      if (url.pathname === "/api/designs" && method === "GET") {
        return GET(request);
      }

      throw new Error(`Unhandled fetch route: ${method} ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchBridge as unknown as typeof fetch);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    process.chdir(originalCwd);
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("persists and round-trips a design when slug is provided", async () => {
    const result = await executeSetDocument({
      requestId: "persist-roundtrip",
      projectSlug: "test-project",
      slug: "roundtrip-home",
      document: createDocument("Roundtrip Home", "text-roundtrip"),
    });

    expect(result.saved).toBe(true);
    expect(result.persisted).toBe(true);
    expect(result.persistedPath).toContain(
      path.join("projects", "test-project", "designs", "roundtrip-home.design.yaml")
    );
    await fs.access(result.persistedPath as string);

    const loadResponse = await GET(
      new Request(
        createApiUrl("/api/designs?projectSlug=test-project&slug=roundtrip-home")
      )
    );
    expect(loadResponse.ok).toBe(true);
    const payload = (await loadResponse.json()) as {
      loaded: boolean;
      document: { metadata: { title?: string } };
      slug: string;
      projectSlug: string;
    };

    expect(payload.loaded).toBe(true);
    expect(payload.slug).toBe("roundtrip-home");
    expect(payload.projectSlug).toBe("test-project");
    expect(payload.document.metadata.title).toBe("Roundtrip Home");
  });

  it("updates project activeDesignSlug on save and load", async () => {
    const saveAlpha = await POST(
      new Request(createApiUrl("/api/designs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: "test-project",
          slug: "alpha",
          document: createDocument("Alpha", "alpha-text"),
        }),
      })
    );
    expect(saveAlpha.ok).toBe(true);

    const saveBeta = await POST(
      new Request(createApiUrl("/api/designs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: "test-project",
          slug: "beta",
          document: createDocument("Beta", "beta-text"),
        }),
      })
    );
    expect(saveBeta.ok).toBe(true);

    const manifestPath = path.join(tempDir, "projects", "test-project", "project.yaml");
    const manifestAfterSave = yaml.load(await fs.readFile(manifestPath, "utf-8")) as {
      activeDesignSlug?: string;
    };
    expect(manifestAfterSave.activeDesignSlug).toBe("beta");

    const loadAlpha = await GET(
      new Request(createApiUrl("/api/designs?projectSlug=test-project&slug=alpha"))
    );
    expect(loadAlpha.ok).toBe(true);

    const manifestAfterLoad = yaml.load(await fs.readFile(manifestPath, "utf-8")) as {
      activeDesignSlug?: string;
    };
    expect(manifestAfterLoad.activeDesignSlug).toBe("alpha");
  });
});
