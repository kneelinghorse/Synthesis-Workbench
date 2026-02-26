/* @vitest-environment jsdom */

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewPane } from "./PreviewPane";
import {
  PREVIEW_MESSAGE_TYPES,
  createPreviewReadyMessage,
} from "@/lib/preview/message-types";
import { useDataContextStore } from "@/lib/stores/data-context";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import { resetTokenState, useTokenStateStore } from "@/lib/stores/token-state";

describe("PreviewPane PostMessage bridge", () => {
  beforeEach(() => {
    resetTokenState();
    usePreviewStateStore.getState().reset();
    useDataContextStore.getState().reset();
    vi.useFakeTimers();
    vi.stubGlobal(
      "requestAnimationFrame",
      ((cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0)) as unknown as typeof requestAnimationFrame
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      ((id: number) => window.clearTimeout(id)) as unknown as typeof cancelAnimationFrame
    );
  });

  afterEach(() => {
    usePreviewStateStore.getState().reset();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("tracks connection status through ready, timeout, and reconnect", async () => {
    const postMessage = vi.fn();
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue({
      postMessage,
    } as unknown as Window);

    const { container } = render(
      <PreviewPane html="<div>State</div>" title="Bridge Test" />
    );
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    await act(async () => {});

    expect(usePreviewStateStore.getState().connectionStatus).toBe("connecting");

    fireEvent.load(iframe);
    expect(usePreviewStateStore.getState().connectionStatus).toBe("connecting");

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(usePreviewStateStore.getState().connectionStatus).toBe("error");

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", { data: createPreviewReadyMessage() })
      );
    });
    expect(usePreviewStateStore.getState().connectionStatus).toBe("connected");

    fireEvent.load(iframe);
    expect(usePreviewStateStore.getState().connectionStatus).toBe("connecting");
  });

  it("re-handshakes on iframe reload and flushes latest queued html", async () => {
    const postMessage = vi.fn();
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue({
      postMessage,
    } as unknown as Window);

    const { container, rerender } = render(
      <PreviewPane html="<div>One</div>" title="Bridge Test" />
    );
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    await act(async () => {});

    fireEvent.load(iframe);
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", { data: createPreviewReadyMessage() })
      );
    });
    await act(async () => {
      vi.runAllTimers();
    });

    expect(postMessage).toHaveBeenCalled();
    // Sandboxed srcDoc iframe gets opaque origin — wildcard is intentional (see PreviewPane.tsx).
    expect(
      postMessage.mock.calls.some(
        (call) => call[1] === "*"
      )
    ).toBe(true);
    expect(
      postMessage.mock.calls.some(
        (call) =>
          call[0]?.type === PREVIEW_MESSAGE_TYPES.COMPONENT_UPDATE &&
          call[0]?.payload?.html === "<div>One</div>"
      )
    ).toBe(true);

    postMessage.mockClear();
    rerender(<PreviewPane html="<div>Two</div>" title="Bridge Test" />);
    await act(async () => {
      vi.runAllTimers();
    });

    expect(
      postMessage.mock.calls.some(
        (call) =>
          call[0]?.type === PREVIEW_MESSAGE_TYPES.COMPONENT_UPDATE &&
          call[0]?.payload?.html === "<div>Two</div>"
      )
    ).toBe(true);

    postMessage.mockClear();
    fireEvent.load(iframe);
    rerender(<PreviewPane html="<div>Three</div>" title="Bridge Test" />);
    await act(async () => {
      vi.runAllTimers();
    });
    expect(postMessage).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", { data: createPreviewReadyMessage() })
      );
    });
    await act(async () => {
      vi.runAllTimers();
    });

    expect(
      postMessage.mock.calls.some(
        (call) =>
          call[0]?.type === PREVIEW_MESSAGE_TYPES.COMPONENT_UPDATE &&
          call[0]?.payload?.html === "<div>Three</div>"
      )
    ).toBe(true);
  });

  it("coalesces rapid token updates and sends only the latest css var state", async () => {
    const postMessage = vi.fn();
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue({
      postMessage,
    } as unknown as Window);

    const { container } = render(
      <PreviewPane html="<div>Stable</div>" title="Bridge Test" />
    );
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    await act(async () => {});

    fireEvent.load(iframe);
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", { data: createPreviewReadyMessage() })
      );
    });
    await act(async () => {
      vi.runAllTimers();
    });
    expect(postMessage).toHaveBeenCalled();
    postMessage.mockClear();

    act(() => {
      useTokenStateStore.getState().setToken("colors.primary", "#111111");
      useTokenStateStore.getState().setToken("colors.primary", "#222222");
      useTokenStateStore.getState().setToken("colors.primary", "#333333");
    });
    await act(async () => {
      vi.runAllTimers();
    });

    const tokenMessages = postMessage.mock.calls
      .map((call) => call[0])
      .filter((msg) => msg?.type === PREVIEW_MESSAGE_TYPES.TOKEN_STATE_UPDATE);

    expect(tokenMessages.length).toBeLessThanOrEqual(2);
    expect(
      tokenMessages[tokenMessages.length - 1]?.payload?.cssVars?.[
        "--colors-primary"
      ]
    ).toBe(
      "#333333"
    );
  });

  it("sends DATA_CONTEXT_UPDATE messages when runtime data context changes", async () => {
    const postMessage = vi.fn();
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue({
      postMessage,
    } as unknown as Window);

    const { container } = render(
      <PreviewPane html="<div>Stable</div>" title="Bridge Test" />
    );
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    await act(async () => {});

    fireEvent.load(iframe);
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", { data: createPreviewReadyMessage() })
      );
    });
    await act(async () => {
      vi.runAllTimers();
    });
    postMessage.mockClear();

    act(() => {
      useDataContextStore.getState().setContext({
        user: { id: "u-1", name: "Alex" },
        metrics: { total: 42 },
      });
    });

    await act(async () => {
      vi.runAllTimers();
    });

    const dataMessages = postMessage.mock.calls
      .map((call) => call[0])
      .filter((msg) => msg?.type === PREVIEW_MESSAGE_TYPES.DATA_CONTEXT_UPDATE);

    expect(dataMessages.length).toBeGreaterThan(0);
    expect(dataMessages[dataMessages.length - 1]?.payload?.context).toEqual({
      user: { id: "u-1", name: "Alex" },
      metrics: { total: 42 },
    });
  });

  it("delivers latest html after a transient component-update postMessage failure", async () => {
    let failNextComponentUpdate = true;
    const postMessage = vi.fn((message: { type?: string }) => {
      if (
        message?.type === PREVIEW_MESSAGE_TYPES.COMPONENT_UPDATE &&
        failNextComponentUpdate
      ) {
        failNextComponentUpdate = false;
        throw new Error("Transient postMessage failure");
      }
    });
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue({
      postMessage,
    } as unknown as Window);

    const { container, rerender } = render(
      <PreviewPane html="<div>Initial</div>" title="Bridge Test" />
    );
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    await act(async () => {});

    fireEvent.load(iframe);
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", { data: createPreviewReadyMessage() })
      );
    });
    await act(async () => {
      vi.runAllTimers();
    });

    rerender(<PreviewPane html="<div>Latest</div>" title="Bridge Test" />);
    await act(async () => {
      vi.runAllTimers();
    });

    const componentUpdates = postMessage.mock.calls
      .map((call) => call[0])
      .filter((msg) => msg?.type === PREVIEW_MESSAGE_TYPES.COMPONENT_UPDATE);

    expect(componentUpdates.length).toBeGreaterThan(1);
    expect(componentUpdates[componentUpdates.length - 1]?.payload?.html).toBe(
      "<div>Latest</div>"
    );
  });
});
