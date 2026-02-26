import { describe, expect, it } from "vitest";

import { evaluateFoundryFragmentContract } from "./foundry-fragment-contract";

const VALID_PAYLOAD = {
  status: "ok",
  mode: "full",
  output: { format: "fragments", strict: false },
  fragments: {
    "dash-banner": {
      nodeId: "dash-banner",
      component: "Banner",
      html: "<section data-oods-component=\"Banner\">Overview</section>",
      cssRefs: ["css.base", "cmp.banner.base"],
    },
    "dash-tabs": {
      nodeId: "dash-tabs",
      component: "Tabs",
      html: "<div data-oods-component=\"Tabs\">Overview</div>",
      cssRefs: ["css.base", "cmp.tabs.base"],
    },
  },
  css: {
    "css.base": "[data-oods-component]{box-sizing:border-box;}",
    "cmp.banner.base": "[data-oods-component=\"Banner\"]{padding:16px;}",
    "cmp.tabs.base": "[data-oods-component=\"Tabs\"]{display:flex;}",
  },
  errors: [],
  warnings: [],
};

describe("evaluateFoundryFragmentContract", () => {
  it("passes for a contract-compliant fragment payload", () => {
    const result = evaluateFoundryFragmentContract(VALID_PAYLOAD, {
      expectedNodeIds: ["dash-banner", "dash-tabs"],
      expectedStrict: false,
      acceptedIsolationModes: ["none"],
    });

    expect(result.pass).toBe(true);
    expect(result.summary.fragmentKeys).toEqual(["dash-banner", "dash-tabs"]);
    expect(result.summary.isolationMode).toBe("none");
  });

  it("fails when fragment markup contains document wrapper tags", () => {
    const result = evaluateFoundryFragmentContract({
      ...VALID_PAYLOAD,
      fragments: {
        "dash-banner": {
          nodeId: "dash-banner",
          component: "Banner",
          html: "<html><body>bad</body></html>",
          cssRefs: ["css.base", "cmp.banner.base"],
        },
      },
    });

    expect(result.pass).toBe(false);
    expect(result.summary.hasDocumentWrappers).toBe(true);
    expect(
      result.checks.find((entry) => entry.id === "fragments.no-document-wrappers")
        ?.pass,
    ).toBe(false);
  });

  it("classifies partial success with fragment-scoped errors as isolated", () => {
    const result = evaluateFoundryFragmentContract(
      {
        ...VALID_PAYLOAD,
        fragments: {
          "dash-banner": VALID_PAYLOAD.fragments["dash-banner"],
        },
        errors: [
          {
            code: "FRAGMENT_RENDER_FAILED",
            path: "/fragments/dash-tabs",
            message: "Cannot render Tabs",
          },
        ],
      },
      {
        expectedNodeIds: ["dash-banner", "dash-tabs"],
        acceptedIsolationModes: ["isolated"],
      },
    );

    expect(result.pass).toBe(true);
    expect(result.summary.isolationMode).toBe("isolated");
    expect(result.summary.errorNodeIds).toEqual(["dash-tabs"]);
  });

  it("classifies full render failure as global-failure", () => {
    const result = evaluateFoundryFragmentContract(
      {
        status: "error",
        mode: "full",
        output: { format: "fragments", strict: false },
        errors: [
          {
            code: "UNKNOWN_COMPONENT",
            path: "/screens/0/children/1/component",
            message: "Unknown component 'UnknownComponent'",
          },
        ],
      },
      {
        acceptedIsolationModes: ["global-failure"],
      },
    );

    expect(result.pass).toBe(true);
    expect(result.summary.isolationMode).toBe("global-failure");
  });

  it("fails deterministic ID checks when fragment key and nodeId diverge", () => {
    const result = evaluateFoundryFragmentContract({
      ...VALID_PAYLOAD,
      fragments: {
        "dash-banner": {
          nodeId: "different-id",
          component: "Banner",
          html: "<section data-oods-component=\"Banner\">Overview</section>",
          cssRefs: ["css.base", "cmp.banner.base"],
        },
      },
    });

    expect(result.pass).toBe(false);
    expect(
      result.checks.find((entry) => entry.id === "fragments.deterministic-ids")
        ?.pass,
    ).toBe(false);
  });

  it("fails when expected node coverage is incomplete", () => {
    const result = evaluateFoundryFragmentContract(
      {
        ...VALID_PAYLOAD,
        fragments: {
          "dash-banner": VALID_PAYLOAD.fragments["dash-banner"],
        },
      },
      {
        expectedNodeIds: ["dash-banner", "dash-tabs"],
      },
    );

    expect(result.pass).toBe(false);
    expect(
      result.checks.find((entry) => entry.id === "coverage.node-ids")?.pass,
    ).toBe(false);
  });

  it("fails when css refs cannot be resolved from css payload", () => {
    const result = evaluateFoundryFragmentContract({
      ...VALID_PAYLOAD,
      css: {
        "css.base": "body{margin:0;}",
      },
    });

    expect(result.pass).toBe(false);
    expect(
      result.checks.find((entry) => entry.id === "fragments.css-refs-resolve")
        ?.pass,
    ).toBe(false);
  });
});
