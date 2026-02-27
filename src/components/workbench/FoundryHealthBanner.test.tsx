/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FoundryHealthBanner } from "./FoundryHealthBanner";

describe("FoundryHealthBanner", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing when status is unknown", () => {
    const { container } = render(
      <FoundryHealthBanner status="unknown" checking={false} onRetry={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when status is initially online (no transition)", () => {
    const { container } = render(
      <FoundryHealthBanner status="online" checking={false} onRetry={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows offline banner when transitioning from online → offline", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <FoundryHealthBanner status="online" checking={false} onRetry={onRetry} />
    );

    rerender(
      <FoundryHealthBanner status="offline" checking={false} onRetry={onRetry} />
    );

    expect(screen.getByText("Foundry Offline")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("shows timeout banner when transitioning from online → timeout", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <FoundryHealthBanner status="online" checking={false} onRetry={onRetry} />
    );

    rerender(
      <FoundryHealthBanner status="timeout" checking={false} onRetry={onRetry} />
    );

    expect(screen.getByText("Foundry Timeout")).toBeTruthy();
  });

  it("shows recovery banner when transitioning from offline → online", () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();

    const { rerender } = render(
      <FoundryHealthBanner status="online" checking={false} onRetry={onRetry} />
    );

    // Go offline first.
    rerender(
      <FoundryHealthBanner status="offline" checking={false} onRetry={onRetry} />
    );
    expect(screen.getByText("Foundry Offline")).toBeTruthy();

    // Come back online.
    rerender(
      <FoundryHealthBanner status="online" checking={false} onRetry={onRetry} />
    );
    expect(screen.getByText("Foundry Reconnected")).toBeTruthy();

    // Recovery banner auto-dismisses after 5s.
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(screen.queryByText("Foundry Reconnected")).toBeNull();

    vi.useRealTimers();
  });

  it("calls onRetry when retry button is clicked", () => {
    const onRetry = vi.fn();

    const { rerender } = render(
      <FoundryHealthBanner status="online" checking={false} onRetry={onRetry} />
    );

    rerender(
      <FoundryHealthBanner status="offline" checking={false} onRetry={onRetry} />
    );

    const retryButton = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("disables retry button when checking is true", () => {
    const onRetry = vi.fn();

    const { rerender } = render(
      <FoundryHealthBanner status="online" checking={false} onRetry={onRetry} />
    );

    rerender(
      <FoundryHealthBanner status="offline" checking={true} onRetry={onRetry} />
    );

    const retryButton = screen.getByRole("button", { name: "Checking..." });
    expect(retryButton).toBeTruthy();
    expect((retryButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("dismisses banner when dismiss button is clicked", () => {
    const onRetry = vi.fn();

    const { rerender } = render(
      <FoundryHealthBanner status="online" checking={false} onRetry={onRetry} />
    );

    rerender(
      <FoundryHealthBanner status="offline" checking={false} onRetry={onRetry} />
    );

    expect(screen.getByText("Foundry Offline")).toBeTruthy();

    const dismissButton = screen.getByRole("button", { name: "Dismiss" });
    fireEvent.click(dismissButton);

    expect(screen.queryByText("Foundry Offline")).toBeNull();
  });

  it("does not show banner for initial unknown → offline (not a mid-session event)", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <FoundryHealthBanner status="unknown" checking={false} onRetry={onRetry} />
    );

    rerender(
      <FoundryHealthBanner status="offline" checking={false} onRetry={onRetry} />
    );

    // Should not show — unknown → offline is not a mid-session transition.
    expect(screen.queryByText("Foundry Offline")).toBeNull();
  });

  it("does not show retry button on recovery banner", () => {
    const onRetry = vi.fn();

    const { rerender } = render(
      <FoundryHealthBanner status="online" checking={false} onRetry={onRetry} />
    );

    rerender(
      <FoundryHealthBanner status="offline" checking={false} onRetry={onRetry} />
    );

    rerender(
      <FoundryHealthBanner status="online" checking={false} onRetry={onRetry} />
    );

    expect(screen.getByText("Foundry Reconnected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
