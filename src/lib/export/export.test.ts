import { describe, it, expect, vi } from "vitest";
import { exportComponentSpec } from "./export-component-spec";
import { exportCss, exportCssThemeFiles } from "./export-css";
import { exportHtml } from "./export-html";
import { exportJson } from "./export-json";
import { exportScss } from "./export-scss";
import { exportYaml } from "./export-yaml";
import { toYAML } from "@/lib/persistence/design-serialization";
import type { DesignDocument } from "@/types/document-model";
import type { TokenState } from "@/types/token-state";
import { DEFAULT_TOKEN_STATE } from "@/types/token-state";
import type { DataContext } from "@/lib/engine/data-binding";

vi.mock("@/lib/persistence/design-serialization", () => ({
  toYAML: vi.fn((doc: DesignDocument) => `metadata:\n  title: ${doc.metadata.title}\n`),
}));

const makeDocument = (title = "Test Design"): DesignDocument => ({
  metadata: { title },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: "1rem" },
    children: [
      {
        nodeType: "component",
        id: "btn-1",
        ref: "oods:Button",
        props: { label: "Click me" },
      },
    ],
  },
});

const makeSpecDocument = (): DesignDocument => ({
  metadata: { title: "Spec Test" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: "1rem" },
    children: [
      {
        nodeType: "component",
        id: "card-1",
        ref: "oods:Card",
        props: {
          title: "$data.user.name",
          accentColor: "var(--colors-primary)",
          spacing: "$spacing-md",
          nested: {
            badgeColor: "--colors-secondary",
            tooltip: "Owner: $data.user.role",
          },
        },
      },
      {
        nodeType: "component",
        id: "btn-1",
        ref: "oods:Button",
        props: {
          label: "Click",
        },
      },
    ],
  },
});

const makeTokens = (): TokenState => ({
  ...DEFAULT_TOKEN_STATE,
  colors: {
    ...DEFAULT_TOKEN_STATE.colors,
    primary: "#ff0000",
  },
});

const makeTokensWithThemes = (): TokenState =>
  ({
    ...makeTokens(),
    themes: {
      dark: {
        colors: {
          primary: "#101010",
          text: {
            primary: "#f8fafc",
          },
        },
      },
      hc: {
        colors: {
          primary: "#000000",
        },
      },
    },
  } as unknown as TokenState);

const makeDataContext = (): DataContext => ({
  user: { name: "Alice" },
});

// ============================================================================
// exportComponentSpec
// ============================================================================

describe("exportComponentSpec", () => {
  it("exports per-component specs with props, token dependencies, and data bindings", () => {
    const result = exportComponentSpec({
      document: makeSpecDocument(),
      tokens: makeTokens(),
    });

    const parsed = JSON.parse(result);
    expect(parsed.documentTitle).toBe("Spec Test");
    expect(parsed.componentCount).toBe(2);
    expect(parsed.exportedAt).toBeDefined();

    const cardSpec = parsed.components.find(
      (component: { id: string }) => component.id === "card-1"
    );
    expect(cardSpec.ref).toBe("oods:Card");
    expect(cardSpec.props.title).toBe("$data.user.name");
    expect(cardSpec.tokenDependencies).toEqual(
      expect.arrayContaining(["colors.primary", "colors.secondary", "spacing.md"])
    );
    expect(cardSpec.dataBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          propPath: "title",
          binding: "$data.user.name",
          dataPath: "user.name",
        }),
        expect.objectContaining({
          propPath: "nested.tooltip",
          binding: "$data.user.role",
          dataPath: "user.role",
        }),
      ])
    );
  });
});

// ============================================================================
// exportCss
// ============================================================================

describe("exportCss", () => {
  it("exports standalone CSS custom properties with annotation comments", () => {
    const css = exportCss({
      tokens: makeTokens(),
      tokenAnnotations: {
        "colors.primary": "Brand CTA color",
      },
    });

    expect(css).toContain(":root {");
    expect(css).toContain("--colors-primary: #ff0000; /* Brand CTA color */");
    expect(css).toContain("--spacing-md:");
  });

  it("exports theme variants as media-query blocks", () => {
    const css = exportCss({
      tokens: makeTokensWithThemes(),
      tokenAnnotations: {
        "themes.dark.colors.primary": "Dark theme primary",
      },
    });

    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain("--colors-primary: #101010; /* Dark theme primary */");
    expect(css).toContain("@media (prefers-contrast: more)");
  });

  it("can emit separate CSS files per theme variant", () => {
    const files = exportCssThemeFiles({
      tokens: makeTokensWithThemes(),
    });

    expect(files["tokens.css"]).toContain(":root {");
    expect(files["tokens.dark.css"]).toContain("--colors-primary: #101010;");
    expect(files["tokens.hc.css"]).toContain("--colors-primary: #000000;");
  });
});

// ============================================================================
// exportHtml
// ============================================================================

describe("exportHtml", () => {
  it("generates a full HTML document with semantic landmarks and inlined CSS variables", () => {
    const html = exportHtml({
      document: makeDocument("My Page"),
      tokens: makeTokens(),
      previewHtml: '<div class="preview">Hello</div>',
      tokenAnnotations: {
        "colors.primary": "Brand CTA color",
      },
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>My Page</title>");
    expect(html).toContain(":root {");
    expect(html).toContain("--colors-primary: #ff0000;");
    expect(html).toContain("Brand CTA color");
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('<main id="main-content" role="main"');
    expect(html).toContain('<div class="preview">Hello</div>');
  });

  it("escapes HTML in the title", () => {
    const html = exportHtml({
      document: makeDocument('<script>alert("xss")</script>'),
      tokens: DEFAULT_TOKEN_STATE,
      previewHtml: "",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes responsive media queries and empty-content fallback", () => {
    const html = exportHtml({
      document: makeDocument("Responsive Test"),
      tokens: DEFAULT_TOKEN_STATE,
      previewHtml: "",
    });

    expect(html).toContain('@media (max-width: 48rem)');
    expect(html).toContain('No composed content available.');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  it("flattens nested token objects to CSS variable paths", () => {
    const html = exportHtml({
      document: makeDocument(),
      tokens: DEFAULT_TOKEN_STATE,
      previewHtml: "",
    });

    expect(html).toContain("--colors-text-primary:");
    expect(html).toContain("--typography-fontFamily-sans:");
    expect(html).toContain("--spacing-md:");
  });
});

// ============================================================================
// exportScss
// ============================================================================

describe("exportScss", () => {
  it("exports standalone SCSS variables and theme maps", () => {
    const scss = exportScss({
      tokens: makeTokensWithThemes(),
      tokenAnnotations: {
        "colors.primary": "Brand CTA color",
        "themes.dark.colors.primary": "Dark theme primary",
      },
    });

    expect(scss).toContain("$colors-primary: #ff0000; /* Brand CTA color */");
    expect(scss).toContain("$theme-dark: (");
    expect(scss).toContain("colors-primary: #101010, /* Dark theme primary */");
  });
});

// ============================================================================
// exportJson
// ============================================================================

describe("exportJson", () => {
  it("returns valid JSON with document, tokenState, dataContext, and exportedAt", () => {
    const json = exportJson({
      document: makeDocument("JSON Test"),
      tokens: makeTokens(),
      dataContext: makeDataContext(),
      tokenAnnotations: {
        "colors.primary": "Brand CTA color",
      },
    });

    const parsed = JSON.parse(json);
    expect(parsed.document.metadata.title).toBe("JSON Test");
    expect(parsed.tokenState.colors.primary).toBe("#ff0000");
    expect(parsed.tokenAnnotations["colors.primary"]).toBe("Brand CTA color");
    expect(parsed.dataContext.user).toEqual({ name: "Alice" });
    expect(parsed.exportedAt).toBeDefined();
    expect(new Date(parsed.exportedAt).getTime()).not.toBeNaN();
  });

  it("produces pretty-printed JSON (indented)", () => {
    const json = exportJson({
      document: makeDocument(),
      tokens: DEFAULT_TOKEN_STATE,
      dataContext: {},
    });

    // Pretty-printed JSON has newlines
    expect(json).toContain("\n");
    expect(json.split("\n").length).toBeGreaterThan(5);
  });

  it("includes empty data context when none provided", () => {
    const json = exportJson({
      document: makeDocument(),
      tokens: DEFAULT_TOKEN_STATE,
      dataContext: {},
    });

    const parsed = JSON.parse(json);
    expect(parsed.dataContext).toEqual({});
    expect(parsed.tokenAnnotations).toEqual({});
  });
});

// ============================================================================
// exportYaml
// ============================================================================

describe("exportYaml", () => {
  it("delegates to toYAML from persistence layer", () => {
    const doc = makeDocument("YAML Test");

    const result = exportYaml({
      document: doc,
      tokenAnnotations: {
        "colors.primary": "Brand CTA color",
      },
    });

    expect(toYAML).toHaveBeenCalledWith(doc);
    expect(result).toContain("title: YAML Test");
    expect(result).toContain("token_annotations:");
    expect(result).toContain('"colors.primary": "Brand CTA color"');
  });
});
