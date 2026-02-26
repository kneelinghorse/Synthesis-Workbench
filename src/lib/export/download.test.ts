import { describe, expect, it, vi } from "vitest";

import { downloadFile, getFilename, getMimeType } from "./download";

describe("getMimeType", () => {
  it("returns text/html for html format", () => {
    expect(getMimeType("html")).toBe("text/html");
  });

  it("returns application/json for json format", () => {
    expect(getMimeType("json")).toBe("application/json");
  });

  it("returns text/yaml for yaml format", () => {
    expect(getMimeType("yaml")).toBe("text/yaml");
  });

  it("returns text/css for css format", () => {
    expect(getMimeType("css")).toBe("text/css");
  });

  it("returns text/x-scss for scss format", () => {
    expect(getMimeType("scss")).toBe("text/x-scss");
  });

  it("returns application/json for spec format", () => {
    expect(getMimeType("spec")).toBe("application/json");
  });

  it("returns text/plain for unknown format", () => {
    expect(getMimeType("txt")).toBe("text/plain");
    expect(getMimeType("unknown")).toBe("text/plain");
  });
});

describe("getFilename", () => {
  it("generates correct HTML filename", () => {
    expect(getFilename("my-design", "html")).toBe("my-design.html");
  });

  it("generates correct JSON filename", () => {
    expect(getFilename("dashboard", "json")).toBe("dashboard.json");
  });

  it("generates correct YAML filename with .design.yaml extension", () => {
    expect(getFilename("dashboard", "yaml")).toBe("dashboard.design.yaml");
  });

  it("generates correct CSS filename", () => {
    expect(getFilename("tokens", "css")).toBe("tokens.css");
  });

  it("generates correct SCSS filename", () => {
    expect(getFilename("tokens", "scss")).toBe("tokens.scss");
  });

  it("generates correct component spec filename", () => {
    expect(getFilename("handoff", "spec")).toBe("handoff.spec.json");
  });

  it("uses dot-format extension for unknown formats", () => {
    expect(getFilename("file", "txt")).toBe("file.txt");
  });
});

describe("downloadFile", () => {
  it("creates blob, triggers download, and cleans up", () => {
    const createObjectURL = vi.fn(() => "blob:test-url");
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
    };

    const mockBody = {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    };

    const mockDocument = {
      createElement: vi.fn(() => mockLink),
      body: mockBody,
    };

    vi.stubGlobal("document", mockDocument);

    downloadFile({
      content: "<html></html>",
      filename: "test.html",
      mimeType: "text/html",
    });

    expect(mockDocument.createElement).toHaveBeenCalledWith("a");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(mockLink.href).toBe("blob:test-url");
    expect(mockLink.download).toBe("test.html");
    expect(mockBody.appendChild).toHaveBeenCalledWith(mockLink);
    expect(mockLink.click).toHaveBeenCalledOnce();
    expect(mockBody.removeChild).toHaveBeenCalledWith(mockLink);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-url");

    vi.unstubAllGlobals();
  });
});
