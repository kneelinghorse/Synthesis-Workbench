import { describe, expect, it, vi } from "vitest";

import {
  WORKBENCH_COMPOSER_INPUT_ID,
  isEditableEventTarget,
  resolveWorkbenchShortcutAction,
  type WorkbenchShortcutEvent,
  writeCommandToComposer,
} from "./keyboard-shortcuts";

const createShortcutEvent = (
  overrides: Partial<WorkbenchShortcutEvent>
): WorkbenchShortcutEvent => ({
  key: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe("keyboard shortcut resolver", () => {
  it("maps primary bracket shortcuts to phase navigation", () => {
    expect(
      resolveWorkbenchShortcutAction(
        createShortcutEvent({ key: "]", metaKey: true }),
        false
      )
    ).toEqual({ type: "phase-step", direction: 1 });

    expect(
      resolveWorkbenchShortcutAction(
        createShortcutEvent({ key: "[", ctrlKey: true }),
        false
      )
    ).toEqual({ type: "phase-step", direction: -1 });
  });

  it("maps primary backslash shortcut to preview toggle", () => {
    expect(
      resolveWorkbenchShortcutAction(
        createShortcutEvent({ key: "\\", metaKey: true }),
        false
      )
    ).toEqual({ type: "toggle-preview" });
  });

  it("maps primary+alt shortcuts to slash command insertion", () => {
    expect(
      resolveWorkbenchShortcutAction(
        createShortcutEvent({ key: "b", metaKey: true, altKey: true }),
        false
      )
    ).toEqual({ type: "insert-command", commandId: "bundle" });

    expect(
      resolveWorkbenchShortcutAction(
        createShortcutEvent({ key: "t", metaKey: true, altKey: true }),
        false
      )
    ).toEqual({ type: "insert-command", commandId: "tokens" });

    expect(
      resolveWorkbenchShortcutAction(
        createShortcutEvent({ key: "r", metaKey: true, altKey: true }),
        false
      )
    ).toEqual({ type: "insert-command", commandId: "render" });

    expect(
      resolveWorkbenchShortcutAction(
        createShortcutEvent({ key: "e", metaKey: true, altKey: true }),
        false
      )
    ).toEqual({ type: "insert-command", commandId: "export" });
  });

  it("opens help with ? only outside editable targets", () => {
    expect(
      resolveWorkbenchShortcutAction(
        createShortcutEvent({ key: "?", shiftKey: true }),
        false
      )
    ).toEqual({ type: "toggle-help" });

    expect(
      resolveWorkbenchShortcutAction(
        createShortcutEvent({ key: "?", shiftKey: true }),
        true
      )
    ).toBeNull();
  });

  it("closes help with Escape", () => {
    expect(
      resolveWorkbenchShortcutAction(createShortcutEvent({ key: "Escape" }), false)
    ).toEqual({ type: "close-help" });
  });
});

describe("editable target detection", () => {
  it("detects standard form controls as editable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");

    expect(isEditableEventTarget(input)).toBe(true);
    expect(isEditableEventTarget(textarea)).toBe(true);
    expect(isEditableEventTarget(select)).toBe(true);
    expect(isEditableEventTarget(div)).toBe(true);
  });

  it("detects nested editable context", () => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = '<div contenteditable="true"><span id="inner">x</span></div>';
    const nested = wrapper.querySelector("#inner");

    expect(isEditableEventTarget(nested)).toBe(true);
  });
});

describe("composer command insertion", () => {
  it("writes command text and emits input event", () => {
    document.body.innerHTML = `<textarea id="${WORKBENCH_COMPOSER_INPUT_ID}"></textarea>`;
    const input = document.getElementById(
      WORKBENCH_COMPOSER_INPUT_ID
    ) as HTMLTextAreaElement | null;
    if (!input) {
      throw new Error("Expected composer textarea.");
    }

    const inputSpy = vi.fn();
    input.addEventListener("input", inputSpy);

    const wrote = writeCommandToComposer("/bundle");

    expect(wrote).toBe(true);
    expect(input.value).toBe("/bundle");
    expect(inputSpy).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
  });

  it("returns false when composer input is missing", () => {
    document.body.innerHTML = "";
    expect(writeCommandToComposer("/bundle")).toBe(false);
  });
});
