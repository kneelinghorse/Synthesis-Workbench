/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatWorkbenchShell } from "./ChatWorkbenchShell";
import { WORKBENCH_COMPOSER_INPUT_ID } from "@/lib/workbench/keyboard-shortcuts";

vi.mock("./ChatPanel", () => ({
  ChatPanel: () => (
    <div data-testid="chat-panel">
      <textarea
        id={WORKBENCH_COMPOSER_INPUT_ID}
        aria-label="Workbench composer mock"
      />
    </div>
  ),
}));

vi.mock("./PreviewPanel", () => ({
  PreviewPanel: () => <div data-testid="preview-panel" />,
}));

vi.mock("./ProjectSwitcher", () => ({
  ProjectSwitcher: () => <div data-testid="project-switcher" />,
}));

describe("ChatWorkbenchShell", () => {
  afterEach(() => {
    cleanup();
  });

  it("toggles preview panel with primary+backslash", () => {
    render(<ChatWorkbenchShell />);
    expect(screen.getByTestId("preview-panel")).toBeTruthy();

    fireEvent.keyDown(window, { key: "\\", metaKey: true });
    expect(screen.queryByTestId("preview-panel")).toBeNull();

    fireEvent.keyDown(window, { key: "\\", metaKey: true });
    expect(screen.getByTestId("preview-panel")).toBeTruthy();
  });

  it("opens help with ? and closes with Escape", () => {
    render(<ChatWorkbenchShell />);

    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    expect(
      screen.getByRole("dialog", { name: "Keyboard shortcuts" })
    ).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Keyboard shortcuts" })
    ).toBeNull();
  });

  it("does not open help when ? is pressed inside editable input", () => {
    render(<ChatWorkbenchShell />);
    const composer = screen.getByLabelText("Workbench composer mock");

    fireEvent.keyDown(composer, { key: "?", shiftKey: true });
    expect(
      screen.queryByRole("dialog", { name: "Keyboard shortcuts" })
    ).toBeNull();
  });
});
