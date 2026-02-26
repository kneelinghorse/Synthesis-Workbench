/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CompositionErrorOverlay } from "./CompositionErrorOverlay";
import type { CompositionError } from "@/lib/engine/composition-renderer";

describe("CompositionErrorOverlay", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when errors array is empty", () => {
    const { container } = render(
      <CompositionErrorOverlay errors={[]} onRetry={vi.fn()} onSkip={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows error count in header", () => {
    const errors: CompositionError[] = [
      { componentId: "btn-1", componentRef: "oods:Button", message: "Render failed" },
      { componentId: "card-1", componentRef: "oods:Card", message: "Missing prop" },
    ];

    render(
      <CompositionErrorOverlay errors={errors} onRetry={vi.fn()} onSkip={vi.fn()} />
    );

    expect(screen.getByText(/2 errors/)).toBeTruthy();
    expect(screen.getByText(/2 skippable/)).toBeTruthy();
  });

  it("shows skip and retry buttons for component errors", () => {
    const errors: CompositionError[] = [
      { componentId: "btn-1", componentRef: "oods:Button", message: "Failed" },
    ];

    render(
      <CompositionErrorOverlay errors={errors} onRetry={vi.fn()} onSkip={vi.fn()} />
    );

    expect(screen.getAllByText("Skip").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Retry").length).toBeGreaterThan(0);
  });

  it("does NOT show skip button for system-level errors", () => {
    const errors: CompositionError[] = [
      { componentId: "_composition", componentRef: "_system", message: "Connection timeout" },
    ];

    render(
      <CompositionErrorOverlay errors={errors} onRetry={vi.fn()} onSkip={vi.fn()} />
    );

    // Should only have "Retry All" in header, no per-error Skip
    const skipButtons = screen.queryAllByText("Skip");
    expect(skipButtons.length).toBe(0);
  });

  it("calls onSkip with componentId when skip is clicked", () => {
    const onSkip = vi.fn();
    const errors: CompositionError[] = [
      { componentId: "btn-1", componentRef: "oods:Button", message: "Failed" },
    ];

    render(
      <CompositionErrorOverlay errors={errors} onRetry={vi.fn()} onSkip={onSkip} />
    );

    fireEvent.click(screen.getByText("Skip"));
    expect(onSkip).toHaveBeenCalledWith("btn-1");
  });

  it("calls onRetry when Retry All is clicked", () => {
    const onRetry = vi.fn();
    const errors: CompositionError[] = [
      { componentId: "btn-1", componentRef: "oods:Button", message: "Failed" },
    ];

    render(
      <CompositionErrorOverlay errors={errors} onRetry={onRetry} onSkip={vi.fn()} />
    );

    fireEvent.click(screen.getByText("Retry All"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows actionable guidance for unknown component errors", () => {
    const errors: CompositionError[] = [
      {
        componentId: "grid-1",
        componentRef: "oods:Grid",
        message: "Unknown component: Grid is not in the registry",
      },
    ];

    render(
      <CompositionErrorOverlay errors={errors} onRetry={vi.fn()} onSkip={vi.fn()} />
    );

    // Should suggest valid components
    expect(screen.getByText(/Valid components:/)).toBeTruthy();
  });

  it("suggests specific component when close match exists", () => {
    const errors: CompositionError[] = [
      {
        componentId: "txt-1",
        componentRef: "oods:Tex",
        message: "Unknown component: Tex not found",
      },
    ];

    render(
      <CompositionErrorOverlay errors={errors} onRetry={vi.fn()} onSkip={vi.fn()} />
    );

    // "Tex" should match "Text" by prefix
    expect(screen.getByText(/Try using oods:Text instead/)).toBeTruthy();
  });

  it("shows data context guidance for binding errors", () => {
    const errors: CompositionError[] = [
      {
        componentId: "btn-1",
        componentRef: "oods:Button",
        message: "Binding $data.user.name references unknown context",
      },
    ];

    render(
      <CompositionErrorOverlay errors={errors} onRetry={vi.fn()} onSkip={vi.fn()} />
    );

    expect(screen.getByText(/Check your data context/)).toBeTruthy();
  });

  it("shows connection guidance for timeout errors", () => {
    const errors: CompositionError[] = [
      {
        componentId: "_composition",
        componentRef: "_system",
        message: "Connection timeout after 5000ms",
      },
    ];

    render(
      <CompositionErrorOverlay errors={errors} onRetry={vi.fn()} onSkip={vi.fn()} />
    );

    expect(screen.getByText(/Foundry may be offline/)).toBeTruthy();
  });

  it("separates system and component errors visually", () => {
    const errors: CompositionError[] = [
      { componentId: "_composition", componentRef: "_system", message: "System error" },
      { componentId: "btn-1", componentRef: "oods:Button", message: "Component error" },
    ];

    render(
      <CompositionErrorOverlay errors={errors} onRetry={vi.fn()} onSkip={vi.fn()} />
    );

    // Both should be visible
    expect(screen.getByText("System error")).toBeTruthy();
    expect(screen.getByText("Component error")).toBeTruthy();

    // Only 1 skip button (for component error, not system)
    expect(screen.getAllByText("Skip").length).toBe(1);
  });

  it("has role=alert for accessibility", () => {
    const errors: CompositionError[] = [
      { componentId: "x", componentRef: "oods:X", message: "Fail" },
    ];

    render(
      <CompositionErrorOverlay errors={errors} onRetry={vi.fn()} onSkip={vi.fn()} />
    );

    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
