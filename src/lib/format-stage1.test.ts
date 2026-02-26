import { describe, expect, it } from "vitest";

import {
  formatRunId,
  formatTimestamp,
  formatMode,
  formatArtifactBadge,
} from "./format-stage1";

describe("formatRunId", () => {
  it("truncates long run IDs with ellipsis", () => {
    const longId = "05a00c1f-63a7-4367-be79-5a2467b7f99d";
    expect(formatRunId(longId)).toBe("05a00c1f\u2026f99d");
  });

  it("returns short IDs unchanged", () => {
    expect(formatRunId("run-1")).toBe("run-1");
    expect(formatRunId("1234567890123456")).toBe("1234567890123456");
  });
});

describe("formatTimestamp", () => {
  it("returns 'Unknown time' for undefined", () => {
    expect(formatTimestamp()).toBe("Unknown time");
    expect(formatTimestamp(undefined)).toBe("Unknown time");
  });

  it("returns the original string for unparseable dates", () => {
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
  });

  it("formats valid ISO dates", () => {
    const result = formatTimestamp("2026-01-15T10:00:00.000Z");
    expect(result).toBeTruthy();
    expect(result).not.toBe("Unknown time");
    expect(result).not.toBe("2026-01-15T10:00:00.000Z");
  });
});

describe("formatMode", () => {
  it("returns null for undefined", () => {
    expect(formatMode()).toBeNull();
    expect(formatMode(undefined)).toBeNull();
  });

  it("capitalizes known modes", () => {
    expect(formatMode("surface")).toBe("Surface");
    expect(formatMode("app")).toBe("App");
    expect(formatMode("suite")).toBe("Suite");
  });

  it("capitalizes first letter for unknown modes", () => {
    expect(formatMode("custom")).toBe("Custom");
  });
});

describe("formatArtifactBadge", () => {
  it("maps known artifact types to labels", () => {
    expect(formatArtifactBadge("token_guess")).toBe("Tokens");
    expect(formatArtifactBadge("component_clusters")).toBe("Components");
    expect(formatArtifactBadge("style_fingerprint")).toBe("Fingerprint");
  });

  it("returns type as-is for unknown types", () => {
    expect(formatArtifactBadge("surface_snapshot")).toBe("surface_snapshot");
  });
});
