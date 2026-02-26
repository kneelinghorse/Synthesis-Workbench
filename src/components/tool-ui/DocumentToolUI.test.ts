import { describe, expect, it } from "vitest";

import { resolveDocumentToolStatus } from "./DocumentToolUI";

describe("resolveDocumentToolStatus", () => {
  it("returns complete when a result has resolved even if runtime status is requires-action", () => {
    const tone = resolveDocumentToolStatus({
      runtimeStatus: "requires-action",
      resolved: true,
      isError: false,
      hasErrors: false,
    });

    expect(tone).toBe("complete");
  });

  it("returns error when tool reports an error", () => {
    const tone = resolveDocumentToolStatus({
      runtimeStatus: "complete",
      resolved: true,
      isError: true,
      hasErrors: false,
    });

    expect(tone).toBe("error");
  });

  it("returns error when result contains validation errors", () => {
    const tone = resolveDocumentToolStatus({
      runtimeStatus: "requires-action",
      resolved: true,
      isError: false,
      hasErrors: true,
    });

    expect(tone).toBe("error");
  });

  it("falls back to runtime status while unresolved", () => {
    const tone = resolveDocumentToolStatus({
      runtimeStatus: "running",
      resolved: false,
      isError: false,
      hasErrors: false,
    });

    expect(tone).toBe("running");
  });
});
