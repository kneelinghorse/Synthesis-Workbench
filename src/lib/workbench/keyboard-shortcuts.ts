export const WORKBENCH_COMPOSER_INPUT_ID = "workbench-composer-input";

export const SHORTCUT_COMMANDS = {
  bundle: "/bundle",
  tokens: "/tokens",
  render: "/render",
  export: "/export html",
} as const;

export type ShortcutCommandId = keyof typeof SHORTCUT_COMMANDS;

export type WorkbenchShortcutAction =
  | { type: "toggle-help" }
  | { type: "close-help" }
  | { type: "phase-step"; direction: 1 | -1 }
  | { type: "toggle-preview" }
  | { type: "insert-command"; commandId: ShortcutCommandId };

export type WorkbenchShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

export type ShortcutHelpItem = {
  keys: string;
  description: string;
};

export const WORKBENCH_SHORTCUT_HELP: ShortcutHelpItem[] = [
  { keys: "Ctrl/Cmd + ]", description: "Move to next phase" },
  { keys: "Ctrl/Cmd + [", description: "Move to previous phase" },
  { keys: "Ctrl/Cmd + \\", description: "Toggle preview panel" },
  { keys: "Ctrl/Cmd + Alt + B", description: "Insert /bundle command" },
  { keys: "Ctrl/Cmd + Alt + T", description: "Insert /tokens command" },
  { keys: "Ctrl/Cmd + Alt + R", description: "Insert /render command" },
  { keys: "Ctrl/Cmd + Alt + E", description: "Insert /export html command" },
  { keys: "?", description: "Show or hide shortcut help" },
  { keys: "Esc", description: "Close shortcut help" },
];

const hasPrimaryModifier = (event: WorkbenchShortcutEvent) =>
  event.metaKey || event.ctrlKey;

const toLowerKey = (key: string) => key.toLowerCase();

export const isEditableEventTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }

  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']"
    )
  );
};

export const resolveWorkbenchShortcutAction = (
  event: WorkbenchShortcutEvent,
  isEditableTarget: boolean
): WorkbenchShortcutAction | null => {
  const key = event.key;
  const normalized = toLowerKey(key);
  const hasPrimary = hasPrimaryModifier(event);

  if (key === "Escape") {
    return { type: "close-help" };
  }

  const questionMarkPressed =
    key === "?" || (key === "/" && event.shiftKey === true);
  if (
    questionMarkPressed &&
    !hasPrimary &&
    !event.altKey &&
    !isEditableTarget
  ) {
    return { type: "toggle-help" };
  }

  if (hasPrimary && !event.shiftKey && !event.altKey) {
    if (key === "]") {
      return { type: "phase-step", direction: 1 };
    }
    if (key === "[") {
      return { type: "phase-step", direction: -1 };
    }
    if (key === "\\") {
      return { type: "toggle-preview" };
    }
  }

  if (hasPrimary && event.altKey && !event.shiftKey) {
    if (normalized === "b") {
      return { type: "insert-command", commandId: "bundle" };
    }
    if (normalized === "t") {
      return { type: "insert-command", commandId: "tokens" };
    }
    if (normalized === "r") {
      return { type: "insert-command", commandId: "render" };
    }
    if (normalized === "e") {
      return { type: "insert-command", commandId: "export" };
    }
  }

  return null;
};

const isComposerInput = (
  value: Element | null
): value is HTMLInputElement | HTMLTextAreaElement =>
  value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement;

export const findWorkbenchComposerInput = (
  root: ParentNode = document
): HTMLInputElement | HTMLTextAreaElement | null => {
  const found = root.querySelector(`#${WORKBENCH_COMPOSER_INPUT_ID}`);
  return isComposerInput(found) ? found : null;
};

const setNativeInputValue = (
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
) => {
  const view = element.ownerDocument.defaultView;
  const prototype =
    element instanceof HTMLTextAreaElement
      ? view?.HTMLTextAreaElement?.prototype
      : view?.HTMLInputElement?.prototype;

  const descriptor = prototype
    ? Object.getOwnPropertyDescriptor(prototype, "value")
    : undefined;

  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
};

export const writeCommandToComposer = (
  command: string,
  root: ParentNode = document
): boolean => {
  const input = findWorkbenchComposerInput(root);
  if (!input) {
    return false;
  }

  setNativeInputValue(input, command);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();

  if (typeof input.setSelectionRange === "function") {
    const caret = command.length;
    input.setSelectionRange(caret, caret);
  }

  return true;
};
