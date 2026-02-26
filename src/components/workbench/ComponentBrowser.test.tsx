/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComponentBrowser } from "./ComponentBrowser";

vi.mock("@/lib/workbench/keyboard-shortcuts", () => ({
  writeCommandToComposer: vi.fn(() => true),
}));

import { writeCommandToComposer } from "@/lib/workbench/keyboard-shortcuts";

describe("ComponentBrowser", () => {
  beforeEach(() => {
    vi.mocked(writeCommandToComposer).mockReset();
    vi.mocked(writeCommandToComposer).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders heading and component count", () => {
    render(<ComponentBrowser />);

    expect(screen.getByText("Component Browser")).toBeTruthy();
    expect(screen.getByText("10 components available")).toBeTruthy();
  });

  it("lists all S44 components", () => {
    render(<ComponentBrowser />);

    const expectedNames = [
      "Badge",
      "Banner",
      "Button",
      "Card",
      "Input",
      "Select",
      "Stack",
      "Table",
      "Tabs",
      "Text",
    ];

    for (const name of expectedNames) {
      expect(screen.getByText(`oods:${name}`)).toBeTruthy();
    }
  });

  it("renders a search input", () => {
    render(<ComponentBrowser />);

    const input = screen.getByLabelText("Search components");
    expect(input).toBeTruthy();
    expect(input.getAttribute("placeholder")).toBe(
      "Search components, traits, props..."
    );
  });

  it("filters components by name", () => {
    render(<ComponentBrowser />);

    fireEvent.change(screen.getByLabelText("Search components"), {
      target: { value: "button" },
    });

    expect(screen.getByText("oods:Button")).toBeTruthy();
    expect(screen.queryByText("oods:Card")).toBeNull();
    expect(screen.queryByText("oods:Table")).toBeNull();
  });

  it("filters components by trait", () => {
    render(<ComponentBrowser />);

    fireEvent.change(screen.getByLabelText("Search components"), {
      target: { value: "typography" },
    });

    expect(screen.getByText("oods:Text")).toBeTruthy();
    expect(screen.queryByText("oods:Button")).toBeNull();
  });

  it("filters components by required prop", () => {
    render(<ComponentBrowser />);

    fireEvent.change(screen.getByLabelText("Search components"), {
      target: { value: "columns" },
    });

    expect(screen.getByText("oods:Table")).toBeTruthy();
    expect(screen.queryByText("oods:Button")).toBeNull();
  });

  it("shows empty state for no matches", () => {
    render(<ComponentBrowser />);

    fireEvent.change(screen.getByLabelText("Search components"), {
      target: { value: "zzzznonexistent" },
    });

    expect(screen.getByText(/No components match/)).toBeTruthy();
  });

  it("expands component details on click", () => {
    render(<ComponentBrowser />);

    fireEvent.click(screen.getByText("oods:Button"));

    expect(screen.getByText("Required Props")).toBeTruthy();
    expect(screen.getByText("label")).toBeTruthy();
    expect(screen.getByText("Insert into Chat")).toBeTruthy();
  });

  it("shows traits section when expanded", () => {
    render(<ComponentBrowser />);

    fireEvent.click(screen.getByText("oods:Button"));

    expect(screen.getByText("Traits")).toBeTruthy();
    // "Action" trait appears both as inline badge and in expanded section
    const actionBadges = screen.getAllByText("Action");
    expect(actionBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("collapses when clicking the same component again", () => {
    render(<ComponentBrowser />);

    fireEvent.click(screen.getByText("oods:Button"));
    expect(screen.getByText("Insert into Chat")).toBeTruthy();

    fireEvent.click(screen.getByText("oods:Button"));
    expect(screen.queryByText("Insert into Chat")).toBeNull();
  });

  it("calls writeCommandToComposer when insert is clicked", () => {
    render(<ComponentBrowser />);

    fireEvent.click(screen.getByText("oods:Button"));
    fireEvent.click(screen.getByText("Insert into Chat"));

    expect(writeCommandToComposer).toHaveBeenCalledTimes(1);
    const call = vi.mocked(writeCommandToComposer).mock.calls[0][0];
    expect(call).toContain("oods:Button");
    expect(call).toContain("label");
  });

  it("shows success notice after insert", () => {
    render(<ComponentBrowser />);

    fireEvent.click(screen.getByText("oods:Button"));
    fireEvent.click(screen.getByText("Insert into Chat"));

    expect(screen.getByText("Inserted oods:Button")).toBeTruthy();
  });

  it("shows fallback notice when composer is unavailable", () => {
    vi.mocked(writeCommandToComposer).mockReturnValue(false);

    render(<ComponentBrowser />);

    fireEvent.click(screen.getByText("oods:Button"));
    fireEvent.click(screen.getByText("Insert into Chat"));

    expect(screen.getByText("Chat composer not available")).toBeTruthy();
  });

  it("has accessible component list role", () => {
    render(<ComponentBrowser />);

    const list = screen.getByRole("list", { name: "Component list" });
    expect(list).toBeTruthy();
    expect(list.querySelectorAll('[role="listitem"]').length).toBe(10);
  });

  it("shows prop signatures for Table component", () => {
    render(<ComponentBrowser />);

    fireEvent.click(screen.getByText("oods:Table"));

    expect(screen.getByText("columns")).toBeTruthy();
    expect(screen.getByText("rows")).toBeTruthy();
  });
});
