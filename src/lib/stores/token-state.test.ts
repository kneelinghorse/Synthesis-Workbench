import { beforeEach, describe, expect, it } from "vitest";

import { resetTokenState, useTokenStateStore } from "./token-state";
import { DEFAULT_TOKEN_STATE } from "@/types/token-state";

describe("useTokenStateStore", () => {
  beforeEach(() => {
    resetTokenState();
  });

  it("initializes with default tokens", () => {
    const state = useTokenStateStore.getState();
    expect(state.tokens).toEqual(DEFAULT_TOKEN_STATE);
    expect(state.changes).toEqual({});
    expect(state.history).toEqual([]);
    expect(state.annotations).toEqual({});
    expect(state.canonicalTokens).toEqual({});
  });

  it("updates a nested token and tracks the change", () => {
    const state = useTokenStateStore.getState();
    state.setToken("colors.primary", "#000000");

    const updated = useTokenStateStore.getState();
    expect(updated.tokens.colors.primary).toBe("#000000");
    expect(updated.changes["colors.primary"]).toEqual({
      from: DEFAULT_TOKEN_STATE.colors.primary,
      to: "#000000",
    });
    expect(updated.history).toHaveLength(1);
    expect(updated.history[0]?.path).toBe("colors.primary");
    expect(updated.history[0]?.source).toBe("manual");
  });

  it("updates multiple tokens in one call", () => {
    const state = useTokenStateStore.getState();
    state.setTokens({
      "typography.fontSize.base": "1.125rem",
      "spacing.md": "1.25rem",
    });

    const updated = useTokenStateStore.getState();
    expect(updated.tokens.typography.fontSize.base).toBe("1.125rem");
    expect(updated.tokens.spacing.md).toBe("1.25rem");
    expect(updated.changes["typography.fontSize.base"]).toEqual({
      from: DEFAULT_TOKEN_STATE.typography.fontSize.base,
      to: "1.125rem",
    });
    expect(updated.changes["spacing.md"]).toEqual({
      from: DEFAULT_TOKEN_STATE.spacing.md,
      to: "1.25rem",
    });
    expect(updated.history).toHaveLength(2);
  });

  it("generates CSS variables from tokens", () => {
    const state = useTokenStateStore.getState();
    const variables = state.toCssVariables();

    expect(variables["--colors-primary"]).toBe(
      DEFAULT_TOKEN_STATE.colors.primary
    );
    expect(variables["--colors-text-primary"]).toBe(
      DEFAULT_TOKEN_STATE.colors.text.primary
    );
    expect(variables["--typography-fontSize-base"]).toBe(
      DEFAULT_TOKEN_STATE.typography.fontSize.base
    );
    expect(variables["--spacing-md"]).toBe(DEFAULT_TOKEN_STATE.spacing.md);
  });

  it("resets a token to its default value", () => {
    const state = useTokenStateStore.getState();
    state.setToken("colors.accent", "#111111");
    state.resetToken("colors.accent");

    const updated = useTokenStateStore.getState();
    expect(updated.tokens.colors.accent).toBe(
      DEFAULT_TOKEN_STATE.colors.accent
    );
    expect(updated.changes["colors.accent"]).toBeUndefined();
    expect(updated.history).toHaveLength(2);
    expect(updated.history[1]?.source).toBe("system");
  });

  it("resets all tokens and clears changes", () => {
    const state = useTokenStateStore.getState();
    state.setToken("colors.primary", "#000000");
    state.setToken("spacing.sm", "0.75rem");
    state.setTokenAnnotation("colors.primary", "Brand primary tone");
    state.resetAll();

    const updated = useTokenStateStore.getState();
    expect(updated.tokens).toEqual(DEFAULT_TOKEN_STATE);
    expect(updated.changes).toEqual({});
    expect(updated.history).toEqual([]);
    expect(updated.annotations).toEqual({});
  });

  it("undoes the last token change for audit/undo workflows", () => {
    const state = useTokenStateStore.getState();
    state.setToken("colors.primary", "#101010");
    state.setToken("colors.primary", "#202020");

    const undone = state.undoLastChange();
    const updated = useTokenStateStore.getState();

    expect(undone).toBe(true);
    expect(updated.tokens.colors.primary).toBe("#101010");
    expect(updated.history).toHaveLength(1);
  });

  it("hydrates and exports persisted snapshots", () => {
    const state = useTokenStateStore.getState();
    state.setToken("custom.banner", "linear-gradient(#111,#222)");
    state.setTokenAnnotation("custom.banner", "Background treatment");

    const snapshot = state.getPersistedSnapshot();
    state.resetAll();
    state.hydrateFromSnapshot(snapshot);

    const hydrated = useTokenStateStore.getState();
    expect(hydrated.tokens.custom.banner).toBe("linear-gradient(#111,#222)");
    expect(hydrated.history).toHaveLength(1);
    expect(hydrated.annotations).toEqual({
      "custom.banner": "Background treatment",
    });
  });

  it("stores and clears token annotations", () => {
    const state = useTokenStateStore.getState();
    state.setTokenAnnotation("colors.primary", "Matches brand palette");
    state.setTokenAnnotation("spacing.md", "Keeps card rhythm");

    const updated = useTokenStateStore.getState();
    expect(updated.annotations).toEqual({
      "colors.primary": "Matches brand palette",
      "spacing.md": "Keeps card rhythm",
    });

    state.setTokenAnnotation("spacing.md", "   ");
    expect(useTokenStateStore.getState().annotations).toEqual({
      "colors.primary": "Matches brand palette",
    });
  });

  it("imports canonical tokens and records import history", () => {
    const state = useTokenStateStore.getState();
    const result = state.syncCanonicalTokens({
      "colors.primary": "#0a0a0a",
      "spacing.md": "1.25rem",
    });

    const updated = useTokenStateStore.getState();
    expect(result.importedCount).toBe(2);
    expect(result.appliedCount).toBe(2);
    expect(result.preservedOverrideCount).toBe(0);
    expect(updated.tokens.colors.primary).toBe("#0a0a0a");
    expect(updated.tokens.spacing.md).toBe("1.25rem");
    expect(updated.canonicalTokens).toEqual({
      "colors.primary": "#0a0a0a",
      "spacing.md": "1.25rem",
    });
    expect(updated.history.at(-1)?.source).toBe("import");

    const entries = updated.getCanonicalEntries();
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.status === "canonical")).toBe(true);
  });

  it("preserves manual overrides when syncing canonical tokens", () => {
    const state = useTokenStateStore.getState();
    state.setToken("colors.primary", "#ff00ff", "manual");

    const result = state.syncCanonicalTokens({
      "colors.primary": "#101010",
      "colors.secondary": "#202020",
    });

    const updated = useTokenStateStore.getState();
    expect(result.importedCount).toBe(2);
    expect(result.appliedCount).toBe(1);
    expect(result.preservedOverrideCount).toBe(1);
    expect(updated.tokens.colors.primary).toBe("#ff00ff");
    expect(updated.tokens.colors.secondary).toBe("#202020");

    const primaryEntry = updated
      .getCanonicalEntries(["colors.primary"])
      .find((entry) => entry.path === "colors.primary");
    expect(primaryEntry?.status).toBe("overridden");
    expect(primaryEntry?.canonical).toBe("#101010");
    expect(primaryEntry?.current).toBe("#ff00ff");
    expect(primaryEntry?.source).toBe("manual");
  });

  it("respects source precedence when applying Stage1 suggestions", () => {
    const state = useTokenStateStore.getState();
    state.syncCanonicalTokens({
      "colors.primary": "#101010",
    });
    state.setToken("colors.primary", "#ff00ff", "manual");

    state.setTokens(
      {
        "colors.primary": "#222222",
      },
      "stage1"
    );

    const updated = useTokenStateStore.getState();
    expect(updated.tokens.colors.primary).toBe("#ff00ff");
    expect(updated.history.at(-1)?.source).toBe("manual");
  });

  it("does not allow canonical sync to override Stage1-sourced values", () => {
    const state = useTokenStateStore.getState();
    state.setTokens(
      {
        "colors.primary": "#222222",
      },
      "stage1"
    );

    const result = state.syncCanonicalTokens({
      "colors.primary": "#101010",
    });

    const updated = useTokenStateStore.getState();
    expect(result.appliedCount).toBe(0);
    expect(result.preservedOverrideCount).toBe(0);
    expect(updated.tokens.colors.primary).toBe("#222222");

    const entry = updated.getCanonicalEntries(["colors.primary"])[0];
    expect(entry?.status).toBe("overridden");
    expect(entry?.source).toBe("stage1");
    expect(entry?.conflict).toBe(true);
    expect(entry?.conflictingSources).toEqual(["canonical", "stage1"]);
  });

  it("surfaces source attribution and supports reset to any source value", () => {
    const state = useTokenStateStore.getState();
    state.syncCanonicalTokens({
      "colors.primary": "#101010",
    });
    state.setTokens(
      {
        "colors.primary": "#222222",
      },
      "stage1"
    );
    state.setToken("colors.primary", "#333333", "manual");

    const beforeReset = useTokenStateStore
      .getState()
      .getTokenAttribution(["colors.primary"])[0];
    expect(beforeReset?.source).toBe("manual");
    expect(beforeReset?.values).toEqual({
      canonical: "#101010",
      stage1: "#222222",
      manual: "#333333",
    });
    expect(beforeReset?.conflict).toBe(true);
    expect(beforeReset?.conflictingSources).toEqual([
      "canonical",
      "stage1",
      "manual",
    ]);

    expect(state.resetTokenToSource("colors.primary", "stage1")).toBe(true);
    expect(useTokenStateStore.getState().tokens.colors.primary).toBe("#222222");
    expect(
      useTokenStateStore.getState().getTokenAttribution(["colors.primary"])[0]
        ?.source
    ).toBe("stage1");

    expect(state.resetTokenToSource("colors.primary", "canonical")).toBe(true);
    expect(useTokenStateStore.getState().tokens.colors.primary).toBe("#101010");
    expect(
      useTokenStateStore.getState().getTokenAttribution(["colors.primary"])[0]
        ?.source
    ).toBe("import");

    expect(state.resetTokenToSource("colors.primary", "manual")).toBe(true);
    expect(useTokenStateStore.getState().tokens.colors.primary).toBe("#333333");
    expect(
      useTokenStateStore.getState().getTokenAttribution(["colors.primary"])[0]
        ?.source
    ).toBe("manual");
  });
});
