import { describe, expect, it } from "vitest";

import {
  PREVIEW_MESSAGE_SOURCE,
  PREVIEW_MESSAGE_TYPES,
  createComponentUpdateMessage,
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
});
