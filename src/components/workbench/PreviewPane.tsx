"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { PREVIEW_INJECT_SCRIPT } from "@/lib/preview/inject-script";
import {
  PREVIEW_MESSAGE_TYPES,
  PREVIEW_ROOT_ID,
  PREVIEW_ROOT_SELECTOR,
  type PreviewMessage,
  createComponentUpdateMessage,
  createDataContextUpdateMessage,
  createTokenStateUpdateMessage,
  isPreviewMessage,
} from "@/lib/preview/message-types";
import { useDataContextStore } from "@/lib/stores/data-context";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import { useTokenStateStore } from "@/lib/stores/token-state";
import { cn } from "@/lib/utils";

type PreviewPaneProps = {
  html?: string;
  className?: string;
  title?: string;
  reloadNonce?: number;
};

const HANDSHAKE_TIMEOUT_MS = 5_000;

/**
 * Target origin for parent → iframe postMessage calls.
 *
 * The preview iframe uses `sandbox="allow-scripts"` WITHOUT `allow-same-origin`,
 * which gives it an opaque ("null") origin. You **cannot** target a null-origin
 * iframe with a specific origin string — the browser silently drops the message.
 * Using `"*"` is safe here because:
 *   1. We control 100% of the iframe content via `srcDoc`.
 *   2. The iframe cannot be navigated (no `allow-top-navigation`).
 *   3. The messages contain no credentials or secrets.
 */
const PREVIEW_TARGET_ORIGIN = "*";

const logPreviewHandshake = (
  event: string,
  detail?: Record<string, unknown>
) => {
  console.debug("preview.handshake", {
    event,
    ...detail,
  });
};

const buildCssVarBlock = (cssVars: Record<string, string>) =>
  Object.entries(cssVars)
    .map(([name, value]) => `    ${name}: ${value};`)
    .join("\n");

const buildCssVarSignature = (cssVars: Record<string, string>) =>
  JSON.stringify(
    Object.entries(cssVars).sort(([a], [b]) => a.localeCompare(b))
  );

export const buildPreviewSrcDoc = (
  cssVars: Record<string, string>,
  html: string
) => {
  const cssVarBlock = buildCssVarBlock(cssVars);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
${cssVarBlock}
      }
      *, *::before, *::after {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        min-height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="${PREVIEW_ROOT_ID}" data-preview-root>
      ${html}
    </div>
    ${PREVIEW_INJECT_SCRIPT}
  </body>
</html>`;
};

export const PreviewPane = ({
  html = "",
  className,
  title = "Preview",
  reloadNonce = 0,
}: PreviewPaneProps) => {
  const tokens = useTokenStateStore((state) => state.tokens);
  const dataContext = useDataContextStore((state) => state.context);
  const dataRevision = useDataContextStore((state) => state.revision);
  const setConnectionStatus = usePreviewStateStore(
    (state) => state.setConnectionStatus
  );
  const cssVars = useMemo(
    () => useTokenStateStore.getState().toCssVariables(),
    [tokens]
  );
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const lastHtmlRef = useRef("");
  const initialCssVarsRef = useRef(cssVars);
  const initialHtmlRef = useRef(html);
  const pendingCssVarsRef = useRef<Record<string, string> | null>(cssVars);
  const pendingHtmlRef = useRef<string | null>(html);
  const pendingDataContextRef = useRef<Record<string, unknown> | null>(dataContext);
  const lastCssSignatureRef = useRef("");
  const lastDataRevisionRef = useRef(-1);
  const flushFrameRef = useRef<number | null>(null);
  const handshakeTimeoutRef = useRef<number | null>(null);
  const initialSrcDoc = useMemo(
    () =>
      buildPreviewSrcDoc(initialCssVarsRef.current, initialHtmlRef.current),
    []
  );
  const srcDoc = useMemo(
    () => `${initialSrcDoc}\n<!-- preview-reload-${reloadNonce} -->`,
    [initialSrcDoc, reloadNonce]
  );
  const clearHandshakeTimeout = useCallback(() => {
    if (handshakeTimeoutRef.current !== null) {
      window.clearTimeout(handshakeTimeoutRef.current);
      handshakeTimeoutRef.current = null;
    }
  }, []);

  const startHandshakeTimeout = useCallback(() => {
    clearHandshakeTimeout();
    handshakeTimeoutRef.current = window.setTimeout(() => {
      logPreviewHandshake("READY_TIMEOUT", { timeoutMs: HANDSHAKE_TIMEOUT_MS });
      setConnectionStatus("error");
    }, HANDSHAKE_TIMEOUT_MS);
  }, [clearHandshakeTimeout, setConnectionStatus]);

  const postPreviewMessage = useCallback((message: PreviewMessage) => {
    const target = iframeRef.current?.contentWindow;
    if (!target) {
      setConnectionStatus("error");
      return false;
    }

    try {
      target.postMessage(message, PREVIEW_TARGET_ORIGIN);
      return true;
    } catch {
      setConnectionStatus("error");
      return false;
    }
  }, [setConnectionStatus]);

  const flushPendingUpdates = useCallback(() => {
    if (!isReady) {
      return;
    }

    const pendingCssVars = pendingCssVarsRef.current;
    if (pendingCssVars) {
      const delivered = postPreviewMessage(
        createTokenStateUpdateMessage(pendingCssVars)
      );
      if (delivered) {
        lastCssSignatureRef.current = buildCssVarSignature(pendingCssVars);
        pendingCssVarsRef.current = null;
      }
    }

    const pendingHtml = pendingHtmlRef.current;
    if (pendingHtml !== null) {
      const delivered = postPreviewMessage(
        createComponentUpdateMessage(PREVIEW_ROOT_SELECTOR, pendingHtml)
      );
      if (delivered) {
        pendingHtmlRef.current = null;
        lastHtmlRef.current = pendingHtml;
      }
    }

    const pendingDataContext = pendingDataContextRef.current;
    if (pendingDataContext) {
      const delivered = postPreviewMessage(
        createDataContextUpdateMessage(pendingDataContext)
      );
      if (delivered) {
        pendingDataContextRef.current = null;
        lastDataRevisionRef.current = dataRevision;
      }
    }
  }, [dataRevision, isReady, postPreviewMessage]);

  const scheduleFlush = useCallback(() => {
    if (flushFrameRef.current !== null) {
      return;
    }

    flushFrameRef.current = window.requestAnimationFrame(() => {
      flushFrameRef.current = null;
      flushPendingUpdates();
    });
  }, [flushPendingUpdates]);

  useEffect(() => {
    setConnectionStatus("connecting");
    return () => {
      if (flushFrameRef.current !== null) {
        window.cancelAnimationFrame(flushFrameRef.current);
      }
      clearHandshakeTimeout();
      setConnectionStatus("disconnected");
    };
  }, [clearHandshakeTimeout, setConnectionStatus]);

  useLayoutEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isPreviewMessage(event.data)) {
        return;
      }
      const iframeWindow = iframeRef.current?.contentWindow;
      if (
        iframeWindow &&
        event.source &&
        event.source !== iframeWindow
      ) {
        return;
      }

      if (event.data.type === PREVIEW_MESSAGE_TYPES.PREVIEW_READY) {
        logPreviewHandshake("READY_RECEIVED");
        clearHandshakeTimeout();
        setConnectionStatus("connected");
        setIsReady(true);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [clearHandshakeTimeout, setConnectionStatus]);

  useEffect(() => {
    const nextSignature = buildCssVarSignature(cssVars);
    if (
      nextSignature === lastCssSignatureRef.current &&
      pendingCssVarsRef.current === null
    ) {
      return;
    }

    pendingCssVarsRef.current = cssVars;
    if (isReady) {
      scheduleFlush();
    }
  }, [cssVars, isReady, scheduleFlush]);

  useEffect(() => {
    if (html === lastHtmlRef.current && pendingHtmlRef.current === null) {
      return;
    }

    pendingHtmlRef.current = html;
    if (isReady) {
      scheduleFlush();
    }
  }, [html, isReady, scheduleFlush]);

  useEffect(() => {
    if (
      dataRevision === lastDataRevisionRef.current &&
      pendingDataContextRef.current === null
    ) {
      return;
    }

    pendingDataContextRef.current = dataContext;
    if (isReady) {
      scheduleFlush();
    }
  }, [dataContext, dataRevision, isReady, scheduleFlush]);

  useEffect(() => {
    if (isReady) {
      scheduleFlush();
    }
  }, [isReady, scheduleFlush]);

  const handleIframeLoad = useCallback(() => {
    logPreviewHandshake("READY_WAIT_STARTED", { reloadNonce });
    setIsReady(false);
    setConnectionStatus("connecting");
    startHandshakeTimeout();
    pendingCssVarsRef.current = cssVars;
    pendingHtmlRef.current = html;
    pendingDataContextRef.current = dataContext;
    lastCssSignatureRef.current = "";
    lastDataRevisionRef.current = -1;
    lastHtmlRef.current = "";
  }, [
    cssVars,
    dataContext,
    html,
    reloadNonce,
    setConnectionStatus,
    startHandshakeTimeout,
  ]);

  return (
    <div
      className={cn(
        "h-full w-full overflow-hidden rounded-3xl bg-white/5 backdrop-blur",
        className
      )}
    >
      <iframe
        title={title}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        ref={iframeRef}
        onLoad={handleIframeLoad}
        className="h-full w-full border-0"
      />
    </div>
  );
};
