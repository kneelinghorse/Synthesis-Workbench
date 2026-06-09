export const WORKBENCH_COMPOSER_INPUT_ID = "workbench-composer-input";

export type WorkbenchShortcutAction =
  | { type: "toggle-help" }
  | { type: "close-help" }
  | { type: "toggle-preview" };

export type WorkbenchShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

export type ShortcutHelpItem = {
  keys: string;
  description: string;
};

export const WORKBENCH_SHORTCUT_HELP: ShortcutHelpItem[] = [
  { keys: "Ctrl/Cmd + \\", description: "Toggle preview panel" },
  { keys: "?", description: "Show or hide shortcut help" },
  { keys: "Esc", description: "Close shortcut help" },
];

const hasPrimaryModifier = (event: WorkbenchShortcutEvent) =>
  event.metaKey || event.ctrlKey;

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
    if (key === "\\") {
      return { type: "toggle-preview" };
    }
  }

  return null;
};
