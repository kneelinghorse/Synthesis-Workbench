/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatWorkbenchShell } from "./ChatWorkbenchShell";
import { resetPhaseState, usePhaseStore } from "@/lib/stores/phase-state";
import { WORKBENCH_COMPOSER_INPUT_ID } from "@/lib/workbench/keyboard-shortcuts";

vi.mock("./ProjectBrowser", () => ({
  ProjectBrowser: () => <div data-testid="project-browser" />,
}));

vi.mock("./TemplateBrowser", () => ({
  TemplateBrowser: () => <div data-testid="template-browser" />,
}));

vi.mock("./FirstRunOnboarding", () => ({
  FirstRunOnboarding: () => <div data-testid="first-run-onboarding" />,
}));

vi.mock("./ChatPanel", () => ({
  ChatPanel: () => (
    <div data-testid="chat-panel">
      <textarea id={WORKBENCH_COMPOSER_INPUT_ID} aria-label="Workbench composer mock" />
    </div>
  ),
}));

vi.mock("./PreviewPanel", () => ({
  PreviewPanel: () => <div data-testid="preview-panel" />,
}));

describe("ChatWorkbenchShell shortcuts", () => {
  beforeEach(() => {
    resetPhaseState();
  });

  afterEach(() => {
    cleanup();
  });

  it("steps phases forward and backward from keyboard shortcuts", () => {
    render(<ChatWorkbenchShell />);

    expect(usePhaseStore.getState().currentPhase).toBe("ingest");

    fireEvent.keyDown(window, { key: "]", metaKey: true });
    expect(usePhaseStore.getState().currentPhase).toBe("explore");

    fireEvent.keyDown(window, { key: "[", metaKey: true });
    expect(usePhaseStore.getState().currentPhase).toBe("ingest");
  });

  it("toggles workflow mode between strict and flexible", () => {
    render(<ChatWorkbenchShell />);
    expect(usePhaseStore.getState().workflowMode).toBe("strict");

    fireEvent.click(screen.getByRole("button", { name: "Flexible" }));
    expect(usePhaseStore.getState().workflowMode).toBe("flexible");

    fireEvent.click(screen.getByRole("button", { name: "Strict" }));
    expect(usePhaseStore.getState().workflowMode).toBe("strict");
  });

  it("toggles preview panel with primary+backslash", () => {
    render(<ChatWorkbenchShell />);
    expect(screen.getByTestId("preview-panel")).toBeTruthy();

    fireEvent.keyDown(window, { key: "\\", metaKey: true });
    expect(screen.queryByTestId("preview-panel")).toBeNull();

    fireEvent.keyDown(window, { key: "\\", metaKey: true });
    expect(screen.getByTestId("preview-panel")).toBeTruthy();
  });

  it("injects slash commands into composer with primary+alt shortcuts", () => {
    render(<ChatWorkbenchShell />);
    const composer = screen.getByLabelText(
      "Workbench composer mock"
    ) as HTMLTextAreaElement;

    fireEvent.keyDown(window, { key: "b", metaKey: true, altKey: true });
    expect(composer.value).toBe("/bundle");

    fireEvent.keyDown(window, { key: "e", metaKey: true, altKey: true });
    expect(composer.value).toBe("/export html");
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
