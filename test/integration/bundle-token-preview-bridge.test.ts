import fs from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { createTokenStateUpdateMessage } from "@/lib/preview/message-types";
import type {
  Stage1InspectionResult,
  Stage1McpClient,
  Stage1RunSummary,
} from "@/lib/mcp/stage1-client";
import { buildStage1BundleFromRun } from "@/lib/stage1/bundle-loader";
import { resetStage1BundleStore, useStage1BundleStore } from "@/lib/stores/stage1-bundle";
import {
  getTokenPathValue,
  resetTokenState,
  useTokenStateStore,
} from "@/lib/stores/token-state";

const notImplemented = async (): Promise<Stage1InspectionResult> => {
  throw new Error("not implemented in test");
};

const fixtureClient: Stage1McpClient = {
  listRuns: async () => [],
  getArtifact: async <T = unknown>(runDir: string, artifactName: string) => {
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
          return JSON.parse(raw) as T;
        } catch {
          return raw as T;
        }
      } catch {
        continue;
      }
    }

    throw new Error(`Artifact not found: ${artifactName}`);
  },
  inspectApp: notImplemented,
  inspectSurface: notImplemented,
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

const MULTI_SITE_RUNS: Stage1RunSummary[] = [
  createFixtureRun("example-com-s8", "0170e664-baf5-47f4-bbce-e4ad61f5ab11"),
  createFixtureRun("neverssl-com-s8", "5e8a7771-6de8-4575-8827-1dfc1251843d"),
  createFixtureRun("info-cern-ch-s8", "52a5463d-ac13-4d07-9e66-fe85eb2eaa52"),
];

const toCssVarName = (tokenPath: string) => `--${tokenPath.replaceAll(".", "-")}`;

describe("Bundle -> Token -> Preview bridge QA", () => {
  beforeEach(() => {
    resetStage1BundleStore();
    resetTokenState();
  });

  it("maps extracted token paths to preview CSS variable names across multi-site bundles", async () => {
    for (const run of MULTI_SITE_RUNS) {
      resetStage1BundleStore();
      resetTokenState();

      const bundle = await buildStage1BundleFromRun(run, fixtureClient);
      const loadResult = useStage1BundleStore.getState().loadBundle(bundle);
      const seedResult = useStage1BundleStore.getState().seedTokenState();

      expect(loadResult.ok).toBe(true);
      expect(seedResult.appliedCount).toBeGreaterThan(0);

      const tokenState = useTokenStateStore.getState().tokens;
      const cssVars = useTokenStateStore.getState().toCssVariables();
      const previewMessage = createTokenStateUpdateMessage(cssVars);

      expect(
        Object.keys(previewMessage.payload.cssVars).length
      ).toBeGreaterThan(0);

      for (const tokenPath of Object.keys(loadResult.tokenSuggestions)) {
        const tokenValue = getTokenPathValue(tokenState, tokenPath);
        if (typeof tokenValue !== "string") {
          continue;
        }
        const cssVarName = toCssVarName(tokenPath);
        expect(cssVars[cssVarName]).toBe(tokenValue);
      }
    }
  });

  it("propagates token updates and drops stale custom CSS vars from preview payloads", () => {
    const tokenStore = useTokenStateStore.getState();

    tokenStore.setToken("colors.primary", "#ff0000");
    expect(tokenStore.toCssVariables()["--colors-primary"]).toBe("#ff0000");

    tokenStore.setToken("custom.temp-banner", "linear-gradient(#111,#222)");
    expect(tokenStore.toCssVariables()["--custom-temp-banner"]).toBe(
      "linear-gradient(#111,#222)"
    );

    tokenStore.resetAll();
    const cssVarsAfterReset = useTokenStateStore.getState().toCssVariables();
    const previewMessageAfterReset = createTokenStateUpdateMessage(cssVarsAfterReset);

    expect(cssVarsAfterReset["--custom-temp-banner"]).toBeUndefined();
    expect(
      previewMessageAfterReset.payload.cssVars["--custom-temp-banner"]
    ).toBeUndefined();
  });
});
