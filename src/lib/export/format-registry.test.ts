import { describe, expect, it } from "vitest";

import {
  BUILT_IN_EXPORT_PLUGINS,
  createExportFormatRegistry,
  listExportFormats,
} from "./format-registry";

describe("format registry", () => {
  it("includes built-in formats for core export flows", () => {
    const formats = listExportFormats().map((plugin) => plugin.format);
    expect(formats).toEqual(
      expect.arrayContaining(["html", "json", "yaml", "css"])
    );
  });

  it("builds a registry with register/get/list behavior", () => {
    const registry = createExportFormatRegistry();

    registry.register({
      format: "markdown",
      name: "Markdown handoff",
      extension: "md",
      serialize: () => "# Export\n",
      mimeType: "text/markdown",
    });

    expect(registry.get("markdown")).toBeDefined();
    expect(registry.get("MARKDOWN")?.extension).toBe(".md");
    expect(registry.list().map((plugin) => plugin.format)).toEqual(["markdown"]);
  });

  it("prevents duplicate keys unless overwrite is enabled", () => {
    const registry = createExportFormatRegistry();
    const plugin = {
      format: "tokenset",
      name: "Token set",
      extension: ".json",
      serialize: () => '{"ok":true}',
    };

    registry.register(plugin);
    expect(() => registry.register(plugin)).toThrow(
      'Export format "tokenset" is already registered.'
    );

    registry.register(
      {
        ...plugin,
        name: "Token set v2",
      },
      { overwrite: true }
    );
    expect(registry.get("tokenset")?.name).toBe("Token set v2");
  });

  it("can initialize a custom registry in one file with built-ins plus plugin", () => {
    const registry = createExportFormatRegistry(BUILT_IN_EXPORT_PLUGINS);
    registry.register({
      format: "tailwind",
      name: "Tailwind config",
      extension: ".tailwind.js",
      serialize: () => "module.exports = {};",
    });

    expect(registry.get("tailwind")?.extension).toBe(".tailwind.js");
    expect(registry.get("html")).toBeDefined();
  });
});
