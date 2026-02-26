import { describe, expect, it } from "vitest";

import { PREVIEW_INJECT_SCRIPT } from "@/lib/preview/inject-script";
import { PREVIEW_ROOT_ID } from "@/lib/preview/message-types";
import { buildPreviewSrcDoc } from "./PreviewPane";

describe("buildPreviewSrcDoc", () => {
  it("injects CSS variables and HTML content", () => {
    const cssVars = {
      "--colors-primary": "#000000",
      "--spacing-md": "1rem",
    };
    const html = "<div id=\"root\">Preview</div>";

    const srcDoc = buildPreviewSrcDoc(cssVars, html);

    expect(srcDoc).toContain("<!doctype html>");
    expect(srcDoc).toContain("--colors-primary: #000000;");
    expect(srcDoc).toContain("--spacing-md: 1rem;");
    expect(srcDoc).toContain(`id=\"${PREVIEW_ROOT_ID}\"`);
    expect(srcDoc).toContain(html);
    expect(srcDoc).toContain(PREVIEW_INJECT_SCRIPT);
    expect(srcDoc).toContain("root.style.removeProperty(name)");
  });

  it("includes structured handshake debug logging in the injected script", () => {
    expect(PREVIEW_INJECT_SCRIPT).toContain('console.debug("preview.handshake"');
    expect(PREVIEW_INJECT_SCRIPT).toContain('debugLog("READY_SENT"');
    expect(PREVIEW_INJECT_SCRIPT).toContain('debugLog("READY_RECEIVED"');
    expect(PREVIEW_INJECT_SCRIPT).toContain('debugLog("READY_TIMEOUT"');
    expect(PREVIEW_INJECT_SCRIPT).toContain("synthesis-preview-data-context-update");
    expect(PREVIEW_INJECT_SCRIPT).toContain("const parentOrigin = resolveParentOrigin()");
    expect(PREVIEW_INJECT_SCRIPT).toContain("window.parent.postMessage(payload, parentOrigin)");
    expect(PREVIEW_INJECT_SCRIPT).not.toContain('window.parent.postMessage(payload, "*")');
  });
});
