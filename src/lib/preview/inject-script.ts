import {
  PREVIEW_MESSAGE_SOURCE,
  PREVIEW_MESSAGE_TYPES,
} from "./message-types";

const buildPreviewInjectScript = () => {
  const source = JSON.stringify(PREVIEW_MESSAGE_SOURCE);
  const types = JSON.stringify(PREVIEW_MESSAGE_TYPES);

  return `
<script>
(() => {
  const SOURCE = ${source};
  const TYPES = ${types};
  const DATA_CONTEXT_EVENT = "synthesis-preview-data-context-update";

  const debugLog = (event, detail = {}) => {
    console.debug("preview.handshake", {
      event,
      ...detail,
    });
  };

  // This script runs inside a sandboxed srcDoc iframe (allow-scripts, NO
  // allow-same-origin).  The iframe's origin is opaque ("null"), so there is
  // no meaningful origin to resolve.  Using "*" is safe because:
  //   1. The parent controls 100% of this iframe's content (srcDoc).
  //   2. The only messages sent are PREVIEW_READY — no secrets.
  const postToParent = (payload) => {
    if (!window.parent) return;
    window.parent.postMessage(payload, "*");
  };

  // Handshake state.
  // Parent-side listeners can miss a single READY ping (e.g. iframe loads fast).
  // Keep pinging until we receive an update message from the parent.
  let receivedParentUpdate = false;
  let readyPingAttempts = 0;
  let readyPingInterval = null;

  const stopReadyPings = () => {
    if (readyPingInterval) {
      clearInterval(readyPingInterval);
      readyPingInterval = null;
    }
  };

  const notifyReady = (trigger) => {
    debugLog("READY_SENT", {
      attempt: readyPingAttempts,
      trigger,
    });
    postToParent({ source: SOURCE, type: TYPES.PREVIEW_READY });
  };

  const startReadyPings = () => {
    stopReadyPings();
    readyPingAttempts = 0;

    // Immediate ping + a couple quick follow-ups, then back off.
    notifyReady("immediate");
    setTimeout(() => {
      if (!receivedParentUpdate) notifyReady("follow-up-25ms");
    }, 25);
    setTimeout(() => {
      if (!receivedParentUpdate) notifyReady("follow-up-125ms");
    }, 125);

    readyPingInterval = setInterval(() => {
      if (receivedParentUpdate) {
        stopReadyPings();
        return;
      }
      if (readyPingAttempts >= 25) {
        debugLog("READY_TIMEOUT", {
          attempts: readyPingAttempts,
        });
        stopReadyPings();
        return;
      }
      readyPingAttempts += 1;
      notifyReady("interval");
    }, 250);
  };

  const markParentUpdateReceived = () => {
    if (!receivedParentUpdate) {
      debugLog("READY_RECEIVED", {
        afterAttempts: readyPingAttempts,
      });
    }
    receivedParentUpdate = true;
    stopReadyPings();
  };

  let appliedCssVars = new Set();

  const applyCssVars = (vars) => {
    if (!vars || typeof vars !== "object") return;
    const root = document.documentElement;
    if (!root) return;
    const nextApplied = new Set();
    Object.entries(vars).forEach(([name, value]) => {
      if (typeof value !== "string" || typeof name !== "string") return;
      root.style.setProperty(name, value);
      nextApplied.add(name);
    });

    appliedCssVars.forEach((name) => {
      if (!nextApplied.has(name)) {
        root.style.removeProperty(name);
      }
    });

    appliedCssVars = nextApplied;
  };

  const updateComponent = (payload) => {
    if (!payload || typeof payload.target !== "string") return;
    const target = document.querySelector(payload.target);
    if (!target) return;
    target.innerHTML = typeof payload.html === "string" ? payload.html : "";
  };

  const applyDataContext = (payload) => {
    const nextContext =
      payload &&
      typeof payload.context === "object" &&
      !Array.isArray(payload.context)
        ? payload.context
        : {};

    window.__SYNTHESIS_PREVIEW_DATA_CONTEXT__ = nextContext;
    window.dispatchEvent(
      new CustomEvent(DATA_CONTEXT_EVENT, {
        detail: { context: nextContext },
      })
    );
  };

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== SOURCE || typeof data.type !== "string") {
      return;
    }

    switch (data.type) {
      case TYPES.TOKEN_STATE_UPDATE:
        applyCssVars(data.payload?.cssVars);
        markParentUpdateReceived();
        break;
      case TYPES.COMPONENT_UPDATE:
        updateComponent(data.payload);
        markParentUpdateReceived();
        break;
      case TYPES.DATA_CONTEXT_UPDATE:
        applyDataContext(data.payload);
        markParentUpdateReceived();
        break;
      default:
        break;
    }
  });

  if (document.readyState === "complete" || document.readyState === "interactive") {
    startReadyPings();
  } else {
    window.addEventListener("DOMContentLoaded", startReadyPings, { once: true });
  }
})();
</script>
  `.trim();
};

export const PREVIEW_INJECT_SCRIPT = buildPreviewInjectScript();
