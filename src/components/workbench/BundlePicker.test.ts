import { describe, expect, it } from "vitest";

import {
  ALL_PROJECTS,
  UNLINKED,
  getRunActionLabel,
  groupRunsForDisplay,
  sortRuns,
} from "./BundlePicker";
import type { Stage1RunSummary } from "@/lib/mcp/stage1-client";

const RUNS: Stage1RunSummary[] = [
  {
    runId: "run-b-older",
    hostname: "beta.example.com",
    timestamp: "2026-02-10T12:00:00.000Z",
    projectId: "proj-b",
  },
  {
    runId: "run-a-newer",
    hostname: "alpha.example.com",
    timestamp: "2026-02-14T09:30:00.000Z",
    projectId: "proj-a",
  },
  {
    runId: "run-a-older",
    hostname: "alpha.example.com",
    timestamp: "2026-02-09T09:30:00.000Z",
  },
];

describe("BundlePicker run shaping", () => {
  it("sorts runs by newest timestamp first", () => {
    const sortedIds = sortRuns(RUNS).map((run) => run.runId);
    expect(sortedIds).toEqual(["run-a-newer", "run-b-older", "run-a-older"]);
  });

  it("groups runs by hostname and preserves newest-first order within each group", () => {
    const grouped = groupRunsForDisplay(RUNS, "", ALL_PROJECTS);

    expect(grouped.map(([hostname]) => hostname)).toEqual([
      "alpha.example.com",
      "beta.example.com",
    ]);
    expect(grouped[0]?.[1].map((run) => run.runId)).toEqual([
      "run-a-newer",
      "run-a-older",
    ]);
    expect(grouped[1]?.[1].map((run) => run.runId)).toEqual(["run-b-older"]);
  });

  it("applies text filter and project filters including unlinked runs", () => {
    const filteredByText = groupRunsForDisplay(RUNS, "run-a", ALL_PROJECTS);
    expect(filteredByText).toHaveLength(1);
    expect(filteredByText[0]?.[0]).toBe("alpha.example.com");
    expect(filteredByText[0]?.[1]).toHaveLength(2);

    const filteredByProject = groupRunsForDisplay(RUNS, "", "proj-b");
    expect(filteredByProject).toHaveLength(1);
    expect(filteredByProject[0]?.[1].map((run) => run.runId)).toEqual([
      "run-b-older",
    ]);

    const filteredUnlinked = groupRunsForDisplay(RUNS, "", UNLINKED);
    expect(filteredUnlinked).toHaveLength(1);
    expect(filteredUnlinked[0]?.[1].map((run) => run.runId)).toEqual([
      "run-a-older",
    ]);
  });

  it("labels associated runs as Linked when not currently selected", () => {
    expect(getRunActionLabel(true, true)).toBe("Selected");
    expect(getRunActionLabel(false, true)).toBe("Linked");
    expect(getRunActionLabel(false, false)).toBe("Load");
  });
});
