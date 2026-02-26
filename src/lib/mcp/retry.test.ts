import { describe, expect, it, vi } from "vitest";

import {
  RETRYABLE_CODES,
  addBreadcrumb,
  getErrorAdvice,
  retryWithBackoff,
  type McpErrorLike,
} from "./retry";

const createMcpError = (
  message: string,
  code: string
): McpErrorLike => {
  const error = new Error(message) as McpErrorLike;
  error.code = code;
  return error;
};

describe("retryWithBackoff", () => {
  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await retryWithBackoff(fn, { baseDelayMs: 1 });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient errors and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(createMcpError("timeout", "TIMEOUT"))
      .mockResolvedValue("recovered");

    const result = await retryWithBackoff(fn, { baseDelayMs: 1 });

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries up to maxAttempts and then throws", async () => {
    const error = createMcpError("timeout", "TIMEOUT");
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 })
    ).rejects.toThrow("timeout");

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable error codes", async () => {
    const error = createMcpError("not found", "NOT_FOUND");
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      retryWithBackoff(fn, { baseDelayMs: 1 })
    ).rejects.toThrow("not found");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry errors without a code", async () => {
    const error = new Error("generic error");
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      retryWithBackoff(fn, { baseDelayMs: 1 })
    ).rejects.toThrow("generic error");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry callback before each retry", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(createMcpError("fail1", "CONNECTION_FAILED"))
      .mockRejectedValueOnce(createMcpError("fail2", "CONNECTION_FAILED"))
      .mockResolvedValue("ok");

    await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.objectContaining({ message: "fail1" }));
    expect(onRetry).toHaveBeenCalledWith(2, expect.objectContaining({ message: "fail2" }));
  });

  it("supports custom retryableCodes", async () => {
    const error = createMcpError("custom error", "CUSTOM_CODE");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue("ok");

    const result = await retryWithBackoff(fn, {
      baseDelayMs: 1,
      retryableCodes: new Set(["CUSTOM_CODE"]),
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry TOOL_ERROR", async () => {
    const fn = vi.fn().mockRejectedValue(createMcpError("bad tool", "TOOL_ERROR"));

    await expect(retryWithBackoff(fn, { baseDelayMs: 1 })).rejects.toThrow("bad tool");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("addBreadcrumb", () => {
  it("passes through on success without modifying result", async () => {
    const result = await addBreadcrumb(async () => "ok", "loading data");
    expect(result).toBe("ok");
  });

  it("adds breadcrumb and advice to thrown error", async () => {
    const error = createMcpError("timed out", "TIMEOUT");

    try {
      await addBreadcrumb(async () => {
        throw error;
      }, "loading artifact style_fingerprint.json from run X");
    } catch (caught) {
      const mcpError = caught as McpErrorLike;
      expect(mcpError.breadcrumb).toBe(
        "loading artifact style_fingerprint.json from run X"
      );
      expect(mcpError.advice).toBe(
        "The server did not respond in time. Check that it is running and responsive."
      );
      return;
    }

    expect.unreachable("should have thrown");
  });

  it("adds breadcrumb without advice for unknown error codes", async () => {
    const error = createMcpError("weird error", "UNKNOWN_CODE");

    try {
      await addBreadcrumb(async () => {
        throw error;
      }, "doing something");
    } catch (caught) {
      const mcpError = caught as McpErrorLike;
      expect(mcpError.breadcrumb).toBe("doing something");
      expect(mcpError.advice).toBeUndefined();
      return;
    }

    expect.unreachable("should have thrown");
  });
});

describe("getErrorAdvice", () => {
  it("returns advice for known error codes", () => {
    expect(getErrorAdvice("TIMEOUT")).toContain("respond in time");
    expect(getErrorAdvice("CONNECTION_FAILED")).toContain("connect");
    expect(getErrorAdvice("MISSING_BASE_URL")).toContain(".env.local");
    expect(getErrorAdvice("INVALID_URL")).toContain("full URL");
    expect(getErrorAdvice("INVALID_RESPONSE")).toContain("malformed");
    expect(getErrorAdvice("NETWORK_ERROR")).toContain("error response");
  });

  it("returns null for undefined code", () => {
    expect(getErrorAdvice(undefined)).toBeNull();
  });

  it("returns null for unknown code", () => {
    expect(getErrorAdvice("NONEXISTENT")).toBeNull();
  });
});

describe("RETRYABLE_CODES", () => {
  it("includes transient error codes", () => {
    expect(RETRYABLE_CODES.has("TIMEOUT")).toBe(true);
    expect(RETRYABLE_CODES.has("NETWORK_ERROR")).toBe(true);
    expect(RETRYABLE_CODES.has("CONNECTION_FAILED")).toBe(true);
  });

  it("excludes non-transient error codes", () => {
    expect(RETRYABLE_CODES.has("TOOL_ERROR")).toBe(false);
    expect(RETRYABLE_CODES.has("NOT_FOUND")).toBe(false);
    expect(RETRYABLE_CODES.has("MISSING_BASE_URL")).toBe(false);
  });
});
