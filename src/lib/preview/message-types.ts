export const PREVIEW_MESSAGE_SOURCE = "synthesis-workbench-preview";

export const PREVIEW_MESSAGE_TYPES = {
  PREVIEW_READY: "PREVIEW_READY",
  TOKEN_STATE_UPDATE: "TOKEN_STATE_UPDATE",
  COMPONENT_UPDATE: "COMPONENT_UPDATE",
  DATA_CONTEXT_UPDATE: "DATA_CONTEXT_UPDATE",
  // iframe -> parent: the human clicked an element carrying a Forge anchor.
  PREVIEW_SELECTION: "PREVIEW_SELECTION",
  // iframe -> parent: current viewport rects of every anchored element, so the
  // parent can position comment pins. Re-broadcast after each COMPONENT_UPDATE,
  // scroll, and resize (the parent cannot read the sandboxed iframe's DOM).
  PREVIEW_ANCHORS: "PREVIEW_ANCHORS",
} as const;

export const PREVIEW_ROOT_ID = "preview-root";
export const PREVIEW_ROOT_SELECTOR = `#${PREVIEW_ROOT_ID}`;

export type PreviewMessageType =
  (typeof PREVIEW_MESSAGE_TYPES)[keyof typeof PREVIEW_MESSAGE_TYPES];

export type PreviewReadyMessage = {
  source: typeof PREVIEW_MESSAGE_SOURCE;
  type: typeof PREVIEW_MESSAGE_TYPES.PREVIEW_READY;
};

export type TokenStateUpdateMessage = {
  source: typeof PREVIEW_MESSAGE_SOURCE;
  type: typeof PREVIEW_MESSAGE_TYPES.TOKEN_STATE_UPDATE;
  payload: {
    cssVars: Record<string, string>;
  };
};

export type ComponentUpdateMessage = {
  source: typeof PREVIEW_MESSAGE_SOURCE;
  type: typeof PREVIEW_MESSAGE_TYPES.COMPONENT_UPDATE;
  payload: {
    target: string;
    html: string;
  };
};

export type DataContextUpdateMessage = {
  source: typeof PREVIEW_MESSAGE_SOURCE;
  type: typeof PREVIEW_MESSAGE_TYPES.DATA_CONTEXT_UPDATE;
  payload: {
    context: Record<string, unknown>;
  };
};

/** Viewport rect of an anchored element, in the iframe's own coordinate space. */
export type PreviewAnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * A Forge anchor located in the preview DOM. `nodeId` is `data-oods-node-id`
 * (the deterministic instance anchor); `label` is `data-oods-label` (the slot
 * anchor). At least one is non-null.
 */
export type PreviewAnchor = {
  nodeId: string | null;
  label: string | null;
};

export type PreviewSelectionMessage = {
  source: typeof PREVIEW_MESSAGE_SOURCE;
  type: typeof PREVIEW_MESSAGE_TYPES.PREVIEW_SELECTION;
  payload: PreviewAnchor & {
    rect: PreviewAnchorRect;
    /** Trimmed text content of the clicked element, for comment context. */
    text: string;
  };
};

export type PreviewAnchorsMessage = {
  source: typeof PREVIEW_MESSAGE_SOURCE;
  type: typeof PREVIEW_MESSAGE_TYPES.PREVIEW_ANCHORS;
  payload: {
    anchors: Array<PreviewAnchor & { rect: PreviewAnchorRect }>;
  };
};

export type PreviewMessage =
  | PreviewReadyMessage
  | TokenStateUpdateMessage
  | ComponentUpdateMessage
  | DataContextUpdateMessage
  | PreviewSelectionMessage
  | PreviewAnchorsMessage;

export const createPreviewReadyMessage = (): PreviewReadyMessage => ({
  source: PREVIEW_MESSAGE_SOURCE,
  type: PREVIEW_MESSAGE_TYPES.PREVIEW_READY,
});

export const createTokenStateUpdateMessage = (
  cssVars: Record<string, string>
): TokenStateUpdateMessage => ({
  source: PREVIEW_MESSAGE_SOURCE,
  type: PREVIEW_MESSAGE_TYPES.TOKEN_STATE_UPDATE,
  payload: {
    cssVars,
  },
});

export const createComponentUpdateMessage = (
  target: string,
  html: string
): ComponentUpdateMessage => ({
  source: PREVIEW_MESSAGE_SOURCE,
  type: PREVIEW_MESSAGE_TYPES.COMPONENT_UPDATE,
  payload: {
    target,
    html,
  },
});

export const createDataContextUpdateMessage = (
  context: Record<string, unknown>
): DataContextUpdateMessage => ({
  source: PREVIEW_MESSAGE_SOURCE,
  type: PREVIEW_MESSAGE_TYPES.DATA_CONTEXT_UPDATE,
  payload: {
    context,
  },
});

export const createPreviewSelectionMessage = (
  payload: PreviewSelectionMessage["payload"]
): PreviewSelectionMessage => ({
  source: PREVIEW_MESSAGE_SOURCE,
  type: PREVIEW_MESSAGE_TYPES.PREVIEW_SELECTION,
  payload,
});

export const createPreviewAnchorsMessage = (
  anchors: PreviewAnchorsMessage["payload"]["anchors"]
): PreviewAnchorsMessage => ({
  source: PREVIEW_MESSAGE_SOURCE,
  type: PREVIEW_MESSAGE_TYPES.PREVIEW_ANCHORS,
  payload: {
    anchors,
  },
});

export const isPreviewMessage = (value: unknown): value is PreviewMessage => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as { source?: unknown; type?: unknown };
  if (record.source !== PREVIEW_MESSAGE_SOURCE) {
    return false;
  }

  return Object.values(PREVIEW_MESSAGE_TYPES).includes(
    record.type as PreviewMessageType
  );
};
