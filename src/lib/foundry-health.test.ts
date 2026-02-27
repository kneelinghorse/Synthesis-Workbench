import { describe, expect, it, vi } from "vitest";

import {
  checkFoundryHealth,
  computeTransition,
  createHealthTracker,
  type FoundryHealthStatus,
} from "./foundry-health";

// ---------------------------------------------------------------------------
// computeTransition
// ---------------------------------------------------------------------------
describe("computeTransition", () => {
  it("detects online → offline as wentOffline", () => {
    const t = computeTransition("online", "offline");
    expect(t.wentOffline).toBe(true);
    expect(t.recovered).toBe(false);
  });

  it("detects online → timeout as wentOffline", () => {
    const t = computeTransition("online", "timeout");
    expect(t.wentOffline).toBe(true);
    expect(t.recovered).toBe(false);
  });

  it("detects offline → online as recovered", () => {
    const t = computeTransition("offline", "online");
    expect(t.wentOffline).toBe(false);
    expect(t.recovered).toBe(true);
  });

  it("detects timeout → online as recovered", () => {
    const t = computeTransition("timeout", "online");
    expect(t.wentOffline).toBe(false);
    expect(t.recovered).toBe(true);
  });

  it("unknown → online is neither wentOffline nor recovered", () => {
    const t = computeTransition("unknown", "online");
    expect(t.wentOffline).toBe(false);
    expect(t.recovered).toBe(false);
  });

  it("unknown → offline is not wentOffline (initial state)", () => {
    const t = computeTransition("unknown", "offline");
    expect(t.wentOffline).toBe(false);
    expect(t.recovered).toBe(false);
  });

  it("online → online is stable (no transition flags)", () => {
    const t = computeTransition("online", "online");
    expect(t.wentOffline).toBe(false);
    expect(t.recovered).toBe(false);
  });

  it("offline → offline is stable (no transition flags)", () => {
    const t = computeTransition("offline", "offline");
    expect(t.wentOffline).toBe(false);
    expect(t.recovered).toBe(false);
  });

  it("offline → timeout does not trigger recovered or wentOffline", () => {
    const t = computeTransition("offline", "timeout");
    expect(t.wentOffline).toBe(false);
    expect(t.recovered).toBe(false);
  });

  it("preserves previous and current in output", () => {
    const t = computeTransition("online", "timeout");
    expect(t.previous).toBe("online");
    expect(t.current).toBe("timeout");
  });
});

// ---------------------------------------------------------------------------
// createHealthTracker
// ---------------------------------------------------------------------------
describe("createHealthTracker", () => {
  it("starts with unknown status and zero checkCount", () => {
    const tracker = createHealthTracker();
    const snap = tracker.snapshot();
    expect(snap.status).toBe("unknown");
    expect(snap.latencyMs).toBeNull();
    expect(snap.lastCheckedAt).toBeNull();
    expect(snap.checkCount).toBe(0);
  });

  it("records online result and increments checkCount", () => {
    const tracker = createHealthTracker();
    const transition = tracker.record({ status: "online", latencyMs: 42 });

    expect(transition.previous).toBe("unknown");
    expect(transition.current).toBe("online");

    const snap = tracker.snapshot();
    expect(snap.status).toBe("online");
    expect(snap.latencyMs).toBe(42);
    expect(snap.checkCount).toBe(1);
    expect(snap.lastCheckedAt).toBeTruthy();
  });

  it("detects wentOffline on second check", () => {
    const tracker = createHealthTracker();
    tracker.record({ status: "online", latencyMs: 10 });
    const transition = tracker.record({ status: "offline", latencyMs: 500 });

    expect(transition.wentOffline).toBe(true);
    expect(transition.recovered).toBe(false);
    expect(tracker.snapshot().checkCount).toBe(2);
  });

  it("detects recovered after offline → online", () => {
    const tracker = createHealthTracker();
    tracker.record({ status: "online", latencyMs: 10 });
    tracker.record({ status: "offline", latencyMs: 500 });
    const transition = tracker.record({ status: "online", latencyMs: 15 });

    expect(transition.recovered).toBe(true);
    expect(transition.wentOffline).toBe(false);
    expect(tracker.snapshot().checkCount).toBe(3);
  });

  it("reset() returns tracker to initial state", () => {
    const tracker = createHealthTracker();
    tracker.record({ status: "online", latencyMs: 10 });
    tracker.reset();

    const snap = tracker.snapshot();
    expect(snap.status).toBe("unknown");
    expect(snap.checkCount).toBe(0);
    expect(snap.lastCheckedAt).toBeNull();
  });

  it("handles null latencyMs (timeout case)", () => {
    const tracker = createHealthTracker();
    tracker.record({ status: "timeout", latencyMs: null });

    const snap = tracker.snapshot();
    expect(snap.status).toBe("timeout");
    expect(snap.latencyMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkFoundryHealth
// ---------------------------------------------------------------------------
describe("checkFoundryHealth", () => {
  it("returns online when fetch succeeds with ok status", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "online", latencyMs: 12 }),
    });

    const result = await checkFoundryHealth({
      endpoint: "/api/foundry/health",
      fetcher: mockFetcher,
    });

    expect(result.status).toBe("online");
    expect(result.latencyMs).toBe(12);
    expect(mockFetcher).toHaveBeenCalledOnce();
  });

  it("returns offline when fetch succeeds with non-ok status", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
    });

    const result = await checkFoundryHealth({
      endpoint: "/api/foundry/health",
      fetcher: mockFetcher,
    });

    expect(result.status).toBe("offline");
    expect(typeof result.latencyMs).toBe("number");
  });

  it("returns offline when fetch throws a network error", async () => {
    const mockFetcher = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const result = await checkFoundryHealth({
      endpoint: "/api/foundry/health",
      fetcher: mockFetcher,
    });

    expect(result.status).toBe("offline");
    expect(typeof result.latencyMs).toBe("number");
  });

  it("returns timeout when fetch is aborted", async () => {
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";

    const mockFetcher = vi.fn().mockRejectedValue(abortError);

    const result = await checkFoundryHealth({
      endpoint: "/api/foundry/health",
      fetcher: mockFetcher,
    });

    expect(result.status).toBe("timeout");
    expect(result.latencyMs).toBeNull();
  });

  it("returns online even if response JSON parsing fails", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error("bad json")),
    });

    const result = await checkFoundryHealth({
      endpoint: "/api/foundry/health",
      fetcher: mockFetcher,
    });

    expect(result.status).toBe("online");
    expect(typeof result.latencyMs).toBe("number");
  });

  it("returns offline when health API reports offline status", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "offline", latencyMs: 50 }),
    });

    const result = await checkFoundryHealth({
      endpoint: "/api/foundry/health",
      fetcher: mockFetcher,
    });

    expect(result.status).toBe("offline");
  });

  it("uses custom endpoint and timeout", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "online", latencyMs: 5 }),
    });

    await checkFoundryHealth({
      endpoint: "/custom/health",
      timeoutMs: 1000,
      fetcher: mockFetcher,
    });

    expect(mockFetcher).toHaveBeenCalledWith(
      "/custom/health",
      expect.objectContaining({ method: "GET" })
    );
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle: tracker with multiple transitions
// ---------------------------------------------------------------------------
describe("health tracker lifecycle", () => {
  const LIFECYCLE: Array<{
    input: { status: "online" | "offline" | "timeout"; latencyMs: number | null };
    expected: { wentOffline: boolean; recovered: boolean; status: FoundryHealthStatus };
  }> = [
    { input: { status: "online", latencyMs: 10 }, expected: { wentOffline: false, recovered: false, status: "online" } },
    { input: { status: "online", latencyMs: 12 }, expected: { wentOffline: false, recovered: false, status: "online" } },
    { input: { status: "timeout", latencyMs: null }, expected: { wentOffline: true, recovered: false, status: "timeout" } },
    { input: { status: "offline", latencyMs: 300 }, expected: { wentOffline: false, recovered: false, status: "offline" } },
    { input: { status: "online", latencyMs: 8 }, expected: { wentOffline: false, recovered: true, status: "online" } },
    { input: { status: "offline", latencyMs: 400 }, expected: { wentOffline: true, recovered: false, status: "offline" } },
    { input: { status: "offline", latencyMs: 500 }, expected: { wentOffline: false, recovered: false, status: "offline" } },
    { input: { status: "online", latencyMs: 6 }, expected: { wentOffline: false, recovered: true, status: "online" } },
  ];

  it("tracks all transitions through a full lifecycle", () => {
    const tracker = createHealthTracker();

    for (const { input, expected } of LIFECYCLE) {
      const transition = tracker.record(input);
      const snap = tracker.snapshot();

      expect(transition.wentOffline).toBe(expected.wentOffline);
      expect(transition.recovered).toBe(expected.recovered);
      expect(snap.status).toBe(expected.status);
    }

    expect(tracker.snapshot().checkCount).toBe(LIFECYCLE.length);
  });
});
