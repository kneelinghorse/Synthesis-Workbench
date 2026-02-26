import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  evaluateFoundryFragmentContract,
  type FragmentContractExpectation,
} from "../src/lib/engine/foundry-fragment-contract";

type FragmentContractFixture = {
  name?: string;
  payload: unknown;
  expectation?: FragmentContractExpectation;
};

const FIXTURE_DIR = path.resolve(
  process.cwd(),
  "test",
  "fixtures",
  "foundry-fragment-contract",
);

const loadFixtures = () => {
  const filenames = readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();

  return filenames.map((filename) => {
    const absolutePath = path.join(FIXTURE_DIR, filename);
    const parsed = JSON.parse(
      readFileSync(absolutePath, "utf8"),
    ) as FragmentContractFixture;
    return {
      filename,
      fixture: parsed,
    };
  });
};

describe("recorded Foundry fragment contract fixtures", () => {
  it("all fixture payloads satisfy their expectations", () => {
    const fixtures = loadFixtures();
    const failed: string[] = [];

    for (const { filename, fixture } of fixtures) {
      const result = evaluateFoundryFragmentContract(
        fixture.payload,
        fixture.expectation,
      );
      if (!result.pass) {
        const failedChecks = result.checks
          .filter((check) => !check.pass)
          .map((check) => `${check.id}: ${check.detail}`)
          .join(" | ");
        failed.push(
          `${fixture.name ?? filename} (${filename}) => ${failedChecks}`,
        );
      }
    }

    expect(failed).toEqual([]);
  });
});
