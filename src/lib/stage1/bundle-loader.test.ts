import { describe, expect, it } from "vitest";

import type {
  Stage1InspectionResult,
  Stage1McpClient,
  Stage1RunSummary,
} from "@/lib/mcp/stage1-client";
import type { Stage1BundleArtifactPayload } from "@/types/stage1-bundle";
import { buildStage1BundleFromRun } from "./bundle-loader";

const notImplemented = async (): Promise<Stage1InspectionResult> => {
  throw new Error("not implemented in test");
};

const createMockClient = (
  resolver: (artifactName: string) => unknown
): Stage1McpClient => ({
  listRuns: async () => [],
  getArtifact: async <T = unknown>(_runDir: string, artifactName: string) => {
    const result = resolver(artifactName);
    if (result instanceof Error) {
      throw result;
    }
    return result as T;
  },
  inspectApp: notImplemented,
  inspectSurface: notImplemented,
});

describe("buildStage1BundleFromRun", () => {
  it("builds a bundle from report-index artifacts using type field", async () => {
    const run: Stage1RunSummary = {
      runId: "run-1",
      hostname: "example.com",
      runDir: "/tmp/out/stage1/example.com/run-1",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return { contractVersion: "1.0.0" };
      }
      if (artifactName === "report-index.json") {
        return {
          artifacts: [
            { type: "style_fingerprint", path: "style_fingerprint.json" },
            { type: "token_guess", path: "token-guess.json" },
            { type: "surface_snapshot", path: "surface_snapshot.json" },
          ],
        };
      }
      if (artifactName === "style_fingerprint.json") {
        return { kind: "style_fingerprint", version: "1.0.0" };
      }
      if (artifactName === "token-guess.json") {
        return {
          kind: "token_guess",
          version: "1.0.0",
          tokens: { "colors.primary": "#111" },
        };
      }
      return new Error("not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);

    expect(bundle.manifest.contractVersion).toBe("1.0.0");
    expect(bundle.artifacts).toHaveLength(2);
    expect(
      (bundle.artifacts as Stage1BundleArtifactPayload[] | undefined)?.map(
        (a: Stage1BundleArtifactPayload) => a.type
      )
    ).toEqual(expect.arrayContaining(["style_fingerprint", "token_guess"]));
  });

  it("excludes unknown artifact types when type-based resolution is used", async () => {
    const run: Stage1RunSummary = {
      runId: "run-type-filter",
      hostname: "example.com",
      runDir: "/tmp/out/stage1/example.com/run-type-filter",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return { contractVersion: "1.0.0" };
      }
      if (artifactName === "report-index.json") {
        return {
          artifacts: [
            { type: "style_fingerprint", path: "style_fingerprint.json" },
            { type: "surface_snapshot", path: "surface_snapshot.json" },
            { type: "dom_snapshot", path: "dom_snapshot.json" },
          ],
        };
      }
      if (artifactName === "style_fingerprint.json") {
        return { kind: "style_fingerprint" };
      }
      return new Error("not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);
    expect(bundle.artifacts).toHaveLength(1);
    expect(
      (bundle.artifacts as Stage1BundleArtifactPayload[] | undefined)?.[0]?.type
    ).toBe("style_fingerprint");
  });

  it("falls back to regex matching when no type fields are present", async () => {
    const run: Stage1RunSummary = {
      runId: "run-regex",
      hostname: "example.com",
      runDir: "/tmp/out/stage1/example.com/run-regex",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return { contractVersion: "1.0.0" };
      }
      if (artifactName === "report-index.json") {
        return {
          artifacts: [
            { path: "style_fingerprint.json", name: "Style Fingerprint" },
          ],
        };
      }
      if (artifactName === "style_fingerprint.json") {
        return { kind: "style_fingerprint" };
      }
      return new Error("not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);
    expect(bundle.artifacts).toHaveLength(1);
    expect(
      (bundle.artifacts as Stage1BundleArtifactPayload[] | undefined)?.[0]?.path
    ).toBe("style_fingerprint.json");
  });

  it("falls back to standard artifacts when report-index is missing", async () => {
    const run: Stage1RunSummary = {
      runId: "run-2",
      hostname: "example.com",
      runDir: "/tmp/out/stage1/example.com/run-2",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return { contractVersion: "1.0.0" };
      }
      if (
        artifactName === "report-index.json" ||
        artifactName === "report_index.json" ||
        artifactName === "artifacts/report-index.json"
      ) {
        return new Error("report-index not found");
      }
      if (artifactName === "style_fingerprint.json") {
        return { kind: "style_fingerprint", version: "1.0.0" };
      }
      return new Error("not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);

    expect(bundle.artifacts).toHaveLength(1);
    expect(
      (bundle.artifacts as Stage1BundleArtifactPayload[] | undefined)?.[0]?.path
    ).toBe("style_fingerprint.json");
  });

  it("extracts projectId from manifest", async () => {
    const run: Stage1RunSummary = {
      runId: "run-project",
      hostname: "example.com",
      runDir: "/tmp/out/stage1/example.com/run-project",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return { contractVersion: "1.0.0", project_id: "my-project" };
      }
      if (artifactName === "report-index.json") {
        return { artifacts: [] };
      }
      return new Error("not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);
    expect(bundle.manifest.projectId).toBe("my-project");
  });

  it("loads manifest from ../manifest.json when manifest.json is unavailable", async () => {
    const run: Stage1RunSummary = {
      runId: "run-manifest-fallback",
      hostname: "example.com",
      runDir: "/tmp/out/stage1/example.com/run-manifest-fallback",
      timestamp: "2026-02-14T18:00:00.000Z",
      mode: "surface",
      projectId: "fallback-project",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return "Artifact not found: manifest.json";
      }
      if (artifactName === "../manifest.json") {
        return { contractVersion: "1.0.0", project_id: "from-manifest" };
      }
      if (artifactName === "report-index.json") {
        return {
          artifacts: [{ type: "style_fingerprint", path: "style_fingerprint.json" }],
        };
      }
      if (artifactName === "style_fingerprint.json") {
        return { kind: "style_fingerprint" };
      }
      return new Error("not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);
    expect(bundle.manifest.contractVersion).toBe("1.0.0");
    expect(bundle.manifest.projectId).toBe("from-manifest");
    expect(bundle.manifest.mode).toBe("surface");
    expect(bundle.manifest.generatedAt).toBe("2026-02-14T18:00:00.000Z");
    expect(bundle.manifest.targets?.[0]?.name).toBe("example.com");
  });

  it("resolves multi-target artifacts from report-index targets array", async () => {
    const run: Stage1RunSummary = {
      runId: "run-suite",
      hostname: "app.example.com",
      runDir: "/tmp/out/stage1/suite/run-suite",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return { contractVersion: "1.0.0", mode: "suite" };
      }
      if (artifactName === "report-index.json") {
        return {
          kind: "report_index",
          version: "1.1.0",
          mode: "suite",
          targets: [
            {
              target_id: "example.com",
              artifacts: [
                {
                  type: "token_guess",
                  path: "targets/example.com/token-guess.json",
                },
              ],
            },
            {
              target_id: "app.example.com",
              artifacts: [
                {
                  type: "token_guess",
                  path: "targets/app.example.com/token-guess.json",
                },
                {
                  type: "component_clusters",
                  path: "targets/app.example.com/component_clusters.json",
                },
              ],
            },
          ],
        };
      }
      if (artifactName === "targets/app.example.com/token-guess.json") {
        return {
          kind: "token_guess",
          version: "1.0.0",
          tokens: { "colors.primary": "#ff0000" },
        };
      }
      if (artifactName === "targets/app.example.com/component_clusters.json") {
        return {
          kind: "component_clusters",
          version: "1.1.0",
          clusters: [{ name: "Button", count: 5, confidence: 0.9 }],
        };
      }
      return new Error("not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);

    expect(bundle.artifacts).toHaveLength(2);
    expect(
      (bundle.artifacts as Stage1BundleArtifactPayload[] | undefined)?.map(
        (a: Stage1BundleArtifactPayload) => a.type
      )
    ).toEqual(expect.arrayContaining(["token_guess", "component_clusters"]));
    expect(
      (bundle.artifacts as Stage1BundleArtifactPayload[] | undefined)?.[0]?.path
    ).toContain("app.example.com");
  });

  it("matches multi-target artifacts when report-index uses id/url fields", async () => {
    const run: Stage1RunSummary = {
      runId: "run-suite-id-fields",
      hostname: "app.example.com",
      runDir: "/tmp/out/stage1/suite/run-suite-id-fields",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return { contractVersion: "1.0.0", mode: "suite" };
      }
      if (artifactName === "report-index.json") {
        return {
          kind: "report_index",
          version: "1.1.0",
          mode: "suite",
          targets: [
            {
              id: "https://www.app.example.com/",
              artifacts: [
                {
                  type: "TOKEN_GUESS",
                  path: "targets/app.example.com/token-guess.json",
                },
              ],
            },
          ],
        };
      }
      if (artifactName === "targets/app.example.com/token-guess.json") {
        return {
          kind: "token_guess",
          version: "1.0.0",
          tokens: { "colors.primary": "#123456" },
        };
      }
      return new Error("not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);
    expect(bundle.artifacts).toHaveLength(1);
    expect(
      (bundle.artifacts as Stage1BundleArtifactPayload[] | undefined)?.[0]?.type
    ).toBe("token_guess");
    expect(
      (bundle.artifacts as Stage1BundleArtifactPayload[] | undefined)?.[0]?.path
    ).toContain("app.example.com");
  });

  it("ignores non-matching target in multi-target mode", async () => {
    const run: Stage1RunSummary = {
      runId: "run-suite-miss",
      hostname: "unknown.com",
      runDir: "/tmp/out/stage1/suite/run-suite-miss",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return { contractVersion: "1.0.0" };
      }
      if (artifactName === "report-index.json") {
        return {
          mode: "suite",
          targets: [
            {
              target_id: "example.com",
              artifacts: [
                { type: "token_guess", path: "targets/example.com/token-guess.json" },
              ],
            },
          ],
        };
      }
      if (artifactName === "style_fingerprint.json") {
        return { kind: "style_fingerprint" };
      }
      return new Error("not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);
    // No matching target and no top-level artifacts → falls back to direct paths
    expect(bundle.artifacts).toHaveLength(1);
    expect(
      (bundle.artifacts as Stage1BundleArtifactPayload[] | undefined)?.[0]?.path
    ).toBe("style_fingerprint.json");
  });

  it("tries alternate report-index candidates when primary candidate returns text missing response", async () => {
    const run: Stage1RunSummary = {
      runId: "run-report-index-fallback",
      hostname: "example.com",
      runDir: "/tmp/out/stage1/example.com/run-report-index-fallback",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return { contractVersion: "1.0.0" };
      }
      if (artifactName === "report-index.json") {
        return "Artifact not found: report-index.json";
      }
      if (artifactName === "report_index.json") {
        return "Artifact not found: report_index.json";
      }
      if (artifactName === "artifacts/report-index.json") {
        return {
          artifacts: [{ type: "token_guess", path: "token-guess.json" }],
        };
      }
      if (artifactName === "token-guess.json") {
        return {
          kind: "token_guess",
          version: "1.0.0",
          tokens: { "colors.primary": "#3366ff" },
        };
      }
      return new Error("not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);
    expect(bundle.artifacts).toHaveLength(1);
    expect(
      (bundle.artifacts as Stage1BundleArtifactPayload[] | undefined)?.[0]?.type
    ).toBe("token_guess");
  });

  it("falls back cleanly when report-index fields have unexpected shapes", async () => {
    const run: Stage1RunSummary = {
      runId: "run-shape-mismatch",
      hostname: "example.com",
      runDir: "/tmp/out/stage1/example.com/run-shape-mismatch",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return { contractVersion: "1.0.0" };
      }
      if (artifactName === "report-index.json") {
        return {
          artifacts: { type: "style_fingerprint", path: "style_fingerprint.json" },
          targets: { target_id: "example.com" },
        };
      }
      if (artifactName === "style_fingerprint.json") {
        return { kind: "style_fingerprint", version: "1.0.0" };
      }
      return new Error("not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);
    expect(bundle.artifacts).toHaveLength(1);
    expect(
      (bundle.artifacts as Stage1BundleArtifactPayload[] | undefined)?.[0]?.path
    ).toBe("style_fingerprint.json");
  });

  it("returns a manifest-only bundle when no artifacts can be resolved", async () => {
    const run: Stage1RunSummary = {
      runId: "run-manifest-only",
      hostname: "example.com",
      runDir: "/tmp/out/stage1/example.com/run-manifest-only",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return { contractVersion: "1.0.0", mode: "surface" };
      }
      return new Error("artifact not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);
    expect(bundle.manifest.contractVersion).toBe("1.0.0");
    expect(bundle.artifacts).toBeUndefined();
  });

  it("handles missing artifacts gracefully in type-based resolution", async () => {
    const run: Stage1RunSummary = {
      runId: "run-partial",
      hostname: "example.com",
      runDir: "/tmp/out/stage1/example.com/run-partial",
    };

    const client = createMockClient((artifactName) => {
      if (artifactName === "manifest.json") {
        return { contractVersion: "1.0.0" };
      }
      if (artifactName === "report-index.json") {
        return {
          artifacts: [
            { type: "token_guess", path: "token-guess.json" },
            { type: "component_clusters", path: "component_clusters.json" },
            { type: "style_fingerprint", path: "style_fingerprint.json" },
          ],
        };
      }
      if (artifactName === "token-guess.json") {
        return new Error("artifact not found");
      }
      if (artifactName === "component_clusters.json") {
        return {
          kind: "component_clusters",
          version: "1.1.0",
          clusters: [],
        };
      }
      if (artifactName === "style_fingerprint.json") {
        return { kind: "style_fingerprint" };
      }
      return new Error("not found");
    });

    const bundle = await buildStage1BundleFromRun(run, client);
    // token-guess is missing but other two should load
    expect(bundle.artifacts).toHaveLength(2);
  });

  it("treats object-shaped missing artifact errors as recoverable", async () => {
    const run: Stage1RunSummary = {
      runId: "run-object-error",
      hostname: "example.com",
      runDir: "/tmp/out/stage1/example.com/run-object-error",
    };

    const client: Stage1McpClient = {
      listRuns: async () => [],
      getArtifact: async <T = unknown>(_runDir: string, artifactName: string) => {
        if (artifactName === "manifest.json") {
          return { contractVersion: "1.0.0" } as T;
        }
        if (artifactName === "report-index.json") {
          return {
            artifacts: [
              { type: "token_guess", path: "token-guess.json" },
              { type: "style_fingerprint", path: "style_fingerprint.json" },
            ],
          } as T;
        }
        if (artifactName === "token-guess.json") {
          throw { message: "artifact missing: token-guess.json" };
        }
        if (artifactName === "style_fingerprint.json") {
          return { kind: "style_fingerprint", version: "1.0.0" } as T;
        }
        throw new Error("not found");
      },
      inspectApp: notImplemented,
      inspectSurface: notImplemented,
    };

    const bundle = await buildStage1BundleFromRun(run, client);
    expect(bundle.artifacts).toHaveLength(1);
    expect(
      (bundle.artifacts as Stage1BundleArtifactPayload[] | undefined)?.[0]?.type
    ).toBe("style_fingerprint");
  });

  it("throws when runDir is missing", async () => {
    const run = {
      runId: "run-3",
      hostname: "example.com",
    } satisfies Stage1RunSummary;

    const client = createMockClient(() => ({}));

    await expect(buildStage1BundleFromRun(run, client)).rejects.toThrow(
      "run directory"
    );
  });
});
