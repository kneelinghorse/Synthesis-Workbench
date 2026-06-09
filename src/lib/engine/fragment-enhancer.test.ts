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

  it("renders the human-readable copy for an unmapped component, not a prop dump", () => {
    const input =
      '<section data-oods-component="Mystery" data-prop-label="foo"></section>';

    const enhanced = enhanceFragment(input, "Mystery", {
      label: "Fallback label",
      count: 4,
    });

    expect(enhanced).toContain('data-enhancer="Generic"');
    // The visible copy is shown…
    expect(enhanced).toContain("Fallback label");
    // …NOT a `key: value` dump (those rows used align-items:baseline), and the
    // non-content prop `count` is never surfaced.
    expect(enhanced).not.toContain("align-items:baseline");
    expect(enhanced).not.toContain("count");
  });

  it("renders a mis-propped Text shell as its copy, not '<type> / content: … / variant: …'", () => {
    // The s20-m09 'one true bug': the agent used content/variant (Forge's real
    // Text prop is `text`), so Forge returned an empty shell and the old generic
    // enhancer dumped "Text / content: … / variant: heading". Now it shows the
    // copy the agent supplied instead. (The shell keeps Forge's data-prop-*
    // attributes — invisible — so we assert on the rendered structure, not them.)
    const input =
      '<p data-oods-component="Text" data-oods-node-id="t2" data-prop-content="Welcome to the test page" data-prop-variant="heading"></p>';

    const enhanced = enhanceFragment(input, "Text", {
      content: "Welcome to the test page",
      variant: "heading",
    });

    expect(enhanced).toContain("Welcome to the test page");
    // No key:value row dump (the variant value is not rendered as content).
    expect(enhanced).not.toContain("align-items:baseline");
    // The Forge anchor on the shell is preserved → still comment-clickable.
    expect(enhanced).toContain('data-oods-node-id="t2"');
  });

  it("shows an explicit unrenderable affordance when there is no copy to render", () => {
    const input = '<section data-oods-component="Mystery"></section>';

    const enhanced = enhanceFragment(input, "Mystery", { onlyConfig: { a: 1 } });

    expect(enhanced).toContain('data-enhancer="Generic"');
    // Names the component + signals nothing rendered — but never dumps props.
    expect(enhanced).toContain("Mystery");
    expect(enhanced).toContain("no preview content");
    expect(enhanced).not.toContain("align-items:baseline");
    expect(enhanced).not.toContain("onlyConfig");
  });

  it("does not render a boolean content prop as the word 'false'", () => {
    // A boolean is never copy — {text:false} must fall through to the affordance,
    // not surface "false" as the visible heading.
    const input = '<p data-oods-component="Text"></p>';

    const enhanced = enhanceFragment(input, "Text", { text: false });

    expect(enhanced).not.toContain("false");
    expect(enhanced).toContain("no preview content");
  });

  it("renders a numeric content prop (0 is legitimate copy)", () => {
    const input = '<p data-oods-component="Text"></p>';

    const enhanced = enhanceFragment(input, "Text", { value: 0 });

    expect(enhanced).toContain(">0<");
    expect(enhanced).not.toContain("no preview content");
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
