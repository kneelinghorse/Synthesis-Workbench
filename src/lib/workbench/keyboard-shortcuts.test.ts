import { describe, expect, it } from "vitest";

import {
  isEditableEventTarget,
  resolveWorkbenchShortcutAction,
  type WorkbenchShortcutEvent,
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
  it("maps primary backslash shortcut to preview toggle", () => {
    expect(
      resolveWorkbenchShortcutAction(
        createShortcutEvent({ key: "\\", metaKey: true }),
        false
      )
    ).toEqual({ type: "toggle-preview" });
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
