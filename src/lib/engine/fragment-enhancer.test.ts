import { describe, expect, it } from "vitest";

import { enhanceFragment } from "./fragment-enhancer";

describe("fragment enhancer", () => {
  it("enhances an empty Card fragment with visible token-based content", () => {
    const input =
      '<article id="kpi-1" data-oods-component="Card" data-prop-value="1,240"></article>';

    const enhanced = enhanceFragment(input, "Card", {
      title: "Active users",
      value: "1,240",
      trend: "+12%",
    });

    expect(enhanced).toContain('data-fragment-enhanced="true"');
    expect(enhanced).toContain('data-enhancer="Card"');
    expect(enhanced).toContain("Active users");
    expect(enhanced).toContain("1,240");
    expect(enhanced).toContain("+12%");
    expect(enhanced).toContain("var(--ref-color-neutral-900");
    expect(enhanced).toContain("var(--ref-typography-sizes-xl");
  });

  it("returns the original fragment when the element already has content", () => {
    const input =
      '<article data-oods-component="Card"><h3>Existing content</h3></article>';

    const enhanced = enhanceFragment(input, "Card", {
      title: "Ignored",
      value: "0",
    });

    expect(enhanced).toBe(input);
  });

  it("falls back to a generic enhancement for unknown component types", () => {
    const input =
      '<section data-oods-component="Mystery" data-prop-label="foo"></section>';

    const enhanced = enhanceFragment(input, "Mystery", {
      label: "Fallback label",
      count: 4,
    });

    expect(enhanced).toContain('data-enhancer="Generic"');
    expect(enhanced).toContain("Mystery");
    expect(enhanced).toContain("Fallback label");
    expect(enhanced).toContain("count");
    expect(enhanced).toContain("4");
  });

  it("uses component props for card content extraction", () => {
    const input =
      '<article data-oods-component="Card" data-prop-value="from-attr"></article>';

    const enhanced = enhanceFragment(input, "Card", {
      title: "Revenue",
      value: "$42k",
      trend: "+8%",
    });

    expect(enhanced).toContain("Revenue");
    expect(enhanced).toContain("$42k");
    expect(enhanced).toContain("+8%");
  });

  it("augments partial Banner fragments when title text is missing", () => {
    const input =
      '<section data-oods-component="Banner">Track pipeline health, adoption, and delivery metrics.</section>';

    const enhanced = enhanceFragment(input, "Banner", {
      title: "Workbench Overview",
      message: "Track pipeline health, adoption, and delivery metrics.",
      intent: "info",
    });

    expect(enhanced).toContain('data-enhancer="Banner"');
    expect(enhanced).toContain("Workbench Overview");
    expect(enhanced).toContain(
      "Track pipeline health, adoption, and delivery metrics.",
    );
  });
});
