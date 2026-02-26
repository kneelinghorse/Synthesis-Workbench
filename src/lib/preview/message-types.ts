export const PREVIEW_MESSAGE_SOURCE = "synthesis-workbench-preview";

export const PREVIEW_MESSAGE_TYPES = {
  PREVIEW_READY: "PREVIEW_READY",
  TOKEN_STATE_UPDATE: "TOKEN_STATE_UPDATE",
  COMPONENT_UPDATE: "COMPONENT_UPDATE",
  DATA_CONTEXT_UPDATE: "DATA_CONTEXT_UPDATE",
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

export type PreviewMessage =
  | PreviewReadyMessage
  | TokenStateUpdateMessage
  | ComponentUpdateMessage
  | DataContextUpdateMessage;

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
