import fs from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { Stage1McpClient, Stage1RunSummary } from "@/lib/mcp/stage1-client";
import { resetStage1BundleStore, useStage1BundleStore } from "@/lib/stores/stage1-bundle";
import { buildStage1BundleFromRun } from "./bundle-loader";

const fixtureClient: Stage1McpClient = {
  listRuns: async () => [],
  getArtifact: async (runDir, artifactName) => {
    const candidatePaths = artifactName.startsWith("../")
      ? [path.resolve(runDir, artifactName)]
      : [
          path.resolve(runDir, artifactName),
          path.resolve(runDir, "artifacts", artifactName),
        ];

    for (const candidatePath of candidatePaths) {
      try {
        const raw = await fs.readFile(candidatePath, "utf8");
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      } catch {
        continue;
      }
    }

    throw new Error(`Artifact not found: ${artifactName}`);
  },
  inspectApp: async () => ({
    run: null,
    payload: null,
  }),
  inspectSurface: async () => ({
    run: null,
    payload: null,
  }),
};

const loadFixtureRun = async (run: Stage1RunSummary) => {
  const bundle = await buildStage1BundleFromRun(run, fixtureClient);
  return useStage1BundleStore.getState().loadBundle(bundle);
};

const CORPUS_ROOT = path.resolve(
  process.cwd(),
  "test/fixtures/stage1-multisite/corpus/stage1"
);

const createFixtureRun = (hostname: string, runId: string): Stage1RunSummary => ({
  runId,
  hostname,
  runDir: path.resolve(CORPUS_ROOT, hostname, runId),
});

describe("Stage1 bundle flow with real fixture artifacts", () => {
  beforeEach(() => {
    resetStage1BundleStore();
  });

  it("ingests three different site runs through bundle loading", async () => {
    const runs: Stage1RunSummary[] = [
      createFixtureRun("example-com-s8", "0170e664-baf5-47f4-bbce-e4ad61f5ab11"),
      createFixtureRun("neverssl-com-s8", "5e8a7771-6de8-4575-8827-1dfc1251843d"),
      createFixtureRun("info-cern-ch-s8", "52a5463d-ac13-4d07-9e66-fe85eb2eaa52"),
    ];

    for (const run of runs) {
      const result = await loadFixtureRun(run);
      expect(result.ok).toBe(true);
      expect(result.tokenSuggestionCount).toBeGreaterThan(0);
    }
  });

  it("ingests partial runs where crawl pass failed but artifacts exist", async () => {
    const run = createFixtureRun(
      "iana-org-s8",
      "4648cec9-d652-4ffd-8f4e-d5d50e38271a"
    );

    const result = await loadFixtureRun(run);

    expect(result.ok).toBe(true);
    expect(result.tokenSuggestionCount).toBeGreaterThan(0);
    expect(result.tokenSuggestions["colors.primary"]).toBeDefined();
  });
});
