import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  evaluateFoundryFragmentContract,
  type FragmentContractExpectation,
  type FragmentContractResult,
} from "../src/lib/engine/foundry-fragment-contract";

type SourceKind = "fixture" | "live";

type HarnessCaseResult = {
  name: string;
  source: SourceKind;
  pass: boolean;
  result: FragmentContractResult;
};

type FixtureFile = {
  name?: string;
  payload: unknown;
  expectation?: FragmentContractExpectation;
};

type GateDecision = "GO" | "CONDITIONAL GO" | "NO-GO" | "PENDING LIVE";

const DEFAULT_BASE_URL = "http://127.0.0.1:4466/run";

const baseUrl =
  process.env.OODS_FOUNDRY_MCP_URL?.trim() ||
  process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL?.trim() ||
  DEFAULT_BASE_URL;

const args = new Set(process.argv.slice(2));
const fixturesOnly = args.has("--fixtures-only");
const requireLive = args.has("--require-live");
const skipLive = fixturesOnly || args.has("--skip-live");

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const summarizeFailedChecks = (result: FragmentContractResult): string => {
  const failed = result.checks.filter((check) => !check.pass);
  if (failed.length === 0) {
    return "none";
  }
  return failed.map((check) => check.id).join(", ");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return null;
};

type FoundryTransport = "bridge" | "jsonrpc";

type FoundryEndpoint = {
  url: string;
  transport: FoundryTransport;
};

const resolveFoundryEndpoint = (value: string): FoundryEndpoint => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Foundry endpoint is empty.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Foundry endpoint must be an absolute URL: ${trimmed}`);
  }

  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/mcp") {
    parsed.pathname = "/mcp";
    return { url: parsed.toString(), transport: "jsonrpc" };
  }
  if (pathname === "/run") {
    parsed.pathname = "/run";
    return { url: parsed.toString(), transport: "bridge" };
  }
  if (pathname === "/") {
    parsed.pathname = "/run";
    return { url: parsed.toString(), transport: "bridge" };
  }

  parsed.pathname = pathname;
  return { url: parsed.toString(), transport: "jsonrpc" };
};

const extractToolPayload = (result: unknown): unknown => {
  if (typeof result === "string") {
    return safeJsonParse(result);
  }

  if (!isRecord(result)) {
    return result;
  }

  if (Array.isArray(result.content)) {
    for (const entry of result.content) {
      if (!isRecord(entry)) continue;
      const entryType = toStringValue(entry.type);
      if (entryType === "json" && "json" in entry) {
        return entry.json;
      }
      if (entryType === "text" && typeof entry.text === "string") {
        return safeJsonParse(entry.text);
      }
    }
  }

  if ("payload" in result) return result.payload;
  if ("data" in result) return result.data;
  if ("result" in result) return result.result;
  return result;
};

const callReplRenderRaw = async (
  input: ReturnType<typeof createFragmentRequest>,
): Promise<unknown> => {
  const endpoint = resolveFoundryEndpoint(baseUrl);
  const body =
    endpoint.transport === "bridge"
      ? {
          tool: "repl",
          input: { action: "render", ...input },
        }
      : {
          jsonrpc: "2.0",
          id: `fragment-harness-${Date.now()}`,
          method: "tools.call",
          params: {
            name: "repl",
            arguments: { action: "render", ...input },
          },
        };

  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const parsed = text.length > 0 ? safeJsonParse(text) : null;
  if (!response.ok) {
    const suffix =
      isRecord(parsed) && typeof parsed.message === "string"
        ? `: ${parsed.message}`
        : "";
    throw new Error(
      `Foundry request failed (${response.status}) at ${endpoint.url}${suffix}`,
    );
  }

  if (endpoint.transport === "bridge") {
    if (isRecord(parsed) && parsed.ok === false) {
      throw new Error(
        toStringValue(parsed.message) || "Foundry bridge returned ok=false.",
      );
    }
    if (isRecord(parsed) && isRecord(parsed.error)) {
      throw new Error(
        toStringValue(parsed.error.message) || "Foundry bridge returned an error.",
      );
    }
    if (isRecord(parsed) && "result" in parsed) {
      return parsed.result;
    }
    return parsed;
  }

  if (isRecord(parsed) && isRecord(parsed.error)) {
    throw new Error(
      toStringValue(parsed.error.message) || "Foundry MCP tool error.",
    );
  }

  if (isRecord(parsed) && "result" in parsed) {
    return extractToolPayload(parsed.result);
  }

  return parsed;
};

const createFragmentRequest = (
  input: {
    strict: boolean;
    children: Array<{
      id: string;
      component: string;
      props?: Record<string, unknown>;
    }>;
  },
) => ({
  mode: "full",
  apply: true,
  output: {
    format: "fragments",
    strict: input.strict,
    includeCss: true,
  },
  schema: {
    version: "2025.11",
    screens: [
      {
        id: "screen-1",
        component: "Stack",
        children: input.children,
      },
    ],
  },
});

const runFixtureHarness = async (): Promise<HarnessCaseResult[]> => {
  const fixtureDir = path.resolve(
    process.cwd(),
    "test",
    "fixtures",
    "foundry-fragment-contract",
  );
  const files = (await readdir(fixtureDir))
    .filter((name) => name.endsWith(".json"))
    .sort();

  const results: HarnessCaseResult[] = [];

  for (const filename of files) {
    const absolutePath = path.join(fixtureDir, filename);
    const content = await readFile(absolutePath, "utf8");
    const fixture = JSON.parse(content) as FixtureFile;
    const result = evaluateFoundryFragmentContract(
      fixture.payload,
      fixture.expectation,
    );

    results.push({
      name: fixture.name ?? filename,
      source: "fixture",
      pass: result.pass,
      result,
    });
  }

  return results;
};

const runLiveHarness = async (): Promise<{
  executed: boolean;
  unavailableReason?: string;
  results: HarnessCaseResult[];
}> => {
  if (skipLive) {
    return {
      executed: false,
      unavailableReason: "Live probes were skipped by CLI flags.",
      results: [],
    };
  }

  try {
    resolveFoundryEndpoint(baseUrl);
  } catch (error) {
    return {
      executed: false,
      unavailableReason: toMessage(error),
      results: [],
    };
  }

  const cases: Array<{
    name: string;
    input: ReturnType<typeof createFragmentRequest>;
    expectation: FragmentContractExpectation;
  }> = [
    {
      name: "live-fragments-success",
      input: createFragmentRequest({
        strict: false,
        children: [
          { id: "node-a", component: "Text", props: { text: "Alpha" } },
          { id: "node-b", component: "Button", props: { label: "Continue" } },
        ],
      }),
      expectation: {
        expectedNodeIds: ["node-a", "node-b"],
        acceptedIsolationModes: ["none"],
        expectedStrict: false,
      },
    },
    {
      name: "live-fragments-isolation-probe",
      input: createFragmentRequest({
        strict: false,
        children: [
          { id: "node-ok", component: "Text", props: { text: "Stable node" } },
          { id: "node-bad", component: "UnknownComponent", props: {} },
        ],
      }),
      expectation: {
        acceptedIsolationModes: ["isolated", "global-failure"],
        requireFragmentFormat: false,
      },
    },
    {
      name: "live-fragments-strict-probe",
      input: createFragmentRequest({
        strict: true,
        children: [
          { id: "node-ok", component: "Text", props: { text: "Stable node" } },
          { id: "node-bad", component: "UnknownComponent", props: {} },
        ],
      }),
      expectation: {
        acceptedIsolationModes: ["isolated", "global-failure"],
        requireFragmentFormat: false,
      },
    },
  ];

  const results: HarnessCaseResult[] = [];

  for (const testCase of cases) {
    try {
      const response = await callReplRenderRaw(testCase.input);
      const result = evaluateFoundryFragmentContract(
        response,
        testCase.expectation,
      );
      results.push({
        name: testCase.name,
        source: "live",
        pass: result.pass,
        result,
      });
    } catch (error) {
      const failedResult = evaluateFoundryFragmentContract(
        {
          status: "error",
          output: {
            format: "fragments",
            strict: testCase.input.output.strict,
          },
          errors: [
            {
              code: "LIVE_CALL_FAILED",
              message: toMessage(error),
              path: "/live/request",
            },
          ],
        },
        {
          acceptedIsolationModes: ["isolated", "global-failure", "none"],
          expectedStrict: testCase.input.output.strict,
        },
      );

      results.push({
        name: testCase.name,
        source: "live",
        pass: false,
        result: failedResult,
      });
    }
  }

  return {
    executed: true,
    results,
  };
};

const resolveGateDecision = (input: {
  fixturePassed: boolean;
  liveExecuted: boolean;
  livePassed: boolean;
  requireLive: boolean;
  liveIsolationMode: string | null;
}): GateDecision => {
  if (!input.fixturePassed) {
    return "NO-GO";
  }

  if (input.requireLive && !input.liveExecuted) {
    return "NO-GO";
  }

  if (input.liveExecuted && !input.livePassed) {
    return "NO-GO";
  }

  if (!input.liveExecuted) {
    return "PENDING LIVE";
  }

  if (input.liveIsolationMode === "global-failure") {
    return "CONDITIONAL GO";
  }

  return "GO";
};

const buildMarkdownReport = (input: {
  generatedAt: string;
  baseUrl: string;
  requireLive: boolean;
  liveExecuted: boolean;
  liveUnavailableReason?: string;
  decision: GateDecision;
  results: HarnessCaseResult[];
  liveIsolationMode: string | null;
}) => {
  const lines: string[] = [];

  lines.push("# Sprint-13 Fragment Contract Adoption Gate");
  lines.push("");
  lines.push("## Run Metadata");
  lines.push(`- Date: ${input.generatedAt.slice(0, 10)}`);
  lines.push(`- Foundry endpoint: \`${input.baseUrl}\``);
  lines.push(`- Live probes required: ${input.requireLive ? "yes" : "no"}`);
  lines.push(`- Live probes executed: ${input.liveExecuted ? "yes" : "no"}`);
  if (input.liveUnavailableReason) {
    lines.push(`- Live probe note: ${input.liveUnavailableReason}`);
  }
  lines.push(`- Gate decision: **${input.decision}**`);
  lines.push("");
  lines.push("## Contract Harness Results");
  lines.push("");
  lines.push(
    "| Case | Source | Status | Isolation Mode | Fragments | Errors | Failed Checks |",
  );
  lines.push("| --- | --- | --- | --- | ---: | ---: | --- |");

  for (const entry of input.results) {
    lines.push(
      `| ${entry.name} | ${entry.source} | ${
        entry.pass ? "PASS" : "FAIL"
      } | ${entry.result.summary.isolationMode} | ${
        entry.result.summary.fragmentKeys.length
      } | ${entry.result.summary.errorCount} | ${summarizeFailedChecks(
        entry.result,
      )} |`,
    );
  }

  lines.push("");
  lines.push("## Adapter Switch Guidance");
  lines.push("");
  lines.push(
    `- Fragment isolation probe mode: ${
      input.liveIsolationMode ?? "not-run"
    }`,
  );
  if (input.decision === "CONDITIONAL GO") {
    lines.push(
      "- Adapter switch may proceed only with component pre-validation enabled before fragment requests.",
    );
  } else if (input.decision === "GO") {
    lines.push(
      "- Adapter switch can proceed once feature-flag rollout controls are in place.",
    );
  } else if (input.decision === "PENDING LIVE") {
    lines.push(
      "- Live Foundry contract probes must be executed before this report can be used as a release gate.",
    );
  } else {
    lines.push(
      "- Do not switch adapters. Resolve failing harness checks and rerun this gate.",
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- This harness validates payload shape, deterministic fragment IDs, wrapper-free fragment HTML, and observed error-isolation semantics.",
  );
  lines.push(
    "- Fixture checks use recorded contract payloads under `test/fixtures/foundry-fragment-contract`.",
  );

  return `${lines.join("\n")}\n`;
};

const run = async () => {
  const fixtureResults = await runFixtureHarness();
  const liveRun = await runLiveHarness();

  const allResults = [...fixtureResults, ...liveRun.results];
  const fixturePassed = fixtureResults.every((entry) => entry.pass);
  const livePassed = liveRun.results.every((entry) => entry.pass);

  const liveIsolationMode =
    liveRun.results.find((entry) => entry.name === "live-fragments-isolation-probe")
      ?.result.summary.isolationMode ?? null;

  const decision = resolveGateDecision({
    fixturePassed,
    liveExecuted: liveRun.executed,
    livePassed,
    requireLive,
    liveIsolationMode,
  });

  const generatedAt = new Date().toISOString();
  const report = buildMarkdownReport({
    generatedAt,
    baseUrl,
    requireLive,
    liveExecuted: liveRun.executed,
    liveUnavailableReason: liveRun.unavailableReason,
    decision,
    results: allResults,
    liveIsolationMode,
  });

  const outputDir = path.resolve(process.cwd(), "docs", "verification");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "s13-fragment-adoption-gate.md");
  await writeFile(outputPath, report, "utf8");

  process.stdout.write(`${outputPath}\n`);
  process.stdout.write(`Gate decision: ${decision}\n`);

  if (decision === "NO-GO") {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  process.stderr.write(
    `Foundry fragment contract verification failed: ${toMessage(error)}\n`,
  );
  process.exit(1);
});
