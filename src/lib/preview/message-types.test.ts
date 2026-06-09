import { describe, expect, it } from "vitest";

import {
  PREVIEW_MESSAGE_SOURCE,
  PREVIEW_MESSAGE_TYPES,
  createComponentUpdateMessage,
  createPreviewAnchorsMessage,
  createPreviewSelectionMessage,
  createTokenStateUpdateMessage,
  isPreviewMessage,
} from "./message-types";

describe("preview message types", () => {
  it("creates token update messages with a stable source", () => {
    const message = createTokenStateUpdateMessage({
      "--colors-primary": "#000000",
    });

    expect(message).toEqual({
      source: PREVIEW_MESSAGE_SOURCE,
      type: PREVIEW_MESSAGE_TYPES.TOKEN_STATE_UPDATE,
      payload: {
        cssVars: {
          "--colors-primary": "#000000",
        },
      },
    });
  });

  it("recognizes preview messages", () => {
    const message = createComponentUpdateMessage("#preview-root", "<div />");

    expect(isPreviewMessage(message)).toBe(true);
    expect(
      isPreviewMessage({
        source: PREVIEW_MESSAGE_SOURCE,
        type: "UNKNOWN",
      })
    ).toBe(false);
  });

  it("creates and recognizes selection messages (iframe -> parent)", () => {
    const message = createPreviewSelectionMessage({
      nodeId: "btn-1",
      label: "PrimarySaveButton",
      rect: { top: 10, left: 20, width: 100, height: 40 },
      text: "Save",
    });

    expect(message).toEqual({
      source: PREVIEW_MESSAGE_SOURCE,
      type: PREVIEW_MESSAGE_TYPES.PREVIEW_SELECTION,
      payload: {
        nodeId: "btn-1",
        label: "PrimarySaveButton",
        rect: { top: 10, left: 20, width: 100, height: 40 },
        text: "Save",
      },
    });
    // isPreviewMessage auto-validates new types via Object.values — no edit needed.
    expect(isPreviewMessage(message)).toBe(true);
  });

  it("creates and recognizes anchor-rect broadcast messages", () => {
    const message = createPreviewAnchorsMessage([
      { nodeId: "btn-1", label: "PrimarySaveButton", rect: { top: 0, left: 0, width: 10, height: 10 } },
      { nodeId: "txt-1", label: null, rect: { top: 50, left: 0, width: 200, height: 24 } },
    ]);

    expect(message.type).toBe(PREVIEW_MESSAGE_TYPES.PREVIEW_ANCHORS);
    expect(message.payload.anchors).toHaveLength(2);
    expect(isPreviewMessage(message)).toBe(true);
  });
});
