import { describe, expect, it } from "vitest";

import { mapFoundryTokensToWorkbenchPaths } from "./token-bridge";

describe("mapFoundryTokensToWorkbenchPaths", () => {
  it("maps direct dot-path tokens", () => {
    const result = mapFoundryTokensToWorkbenchPaths({
      "colors.primary": "#111111",
      "typography.fontSize.base": "1rem",
      "spacing.md": "1rem",
    });

    expect(result.mappedTokens).toEqual({
      "colors.primary": "#111111",
      "typography.fontSize.base": "1rem",
      "spacing.md": "1rem",
    });
    expect(result.unmappedPaths).toEqual([]);
  });

  it("maps nested token payloads with value fields", () => {
    const result = mapFoundryTokensToWorkbenchPaths({
      tokens: {
        colors: {
          primary: { value: "#222222" },
        },
        typography: {
          fontFamily: {
            sans: { $value: "Inter, system-ui, sans-serif" },
          },
        },
      },
    });

    expect(result.mappedTokens["colors.primary"]).toBe("#222222");
    expect(result.mappedTokens["typography.fontFamily.sans"]).toBe(
      "Inter, system-ui, sans-serif"
    );
  });

  it("maps prefixed and css-variable style token paths", () => {
    const result = mapFoundryTokensToWorkbenchPaths({
      "theme.colors.primary": "#333333",
      "--typography-font-family-sans": "IBM Plex Sans, sans-serif",
      "radii.md": "0.375rem",
      "space.lg": "1.5rem",
    });

    expect(result.mappedTokens["colors.primary"]).toBe("#333333");
    expect(result.mappedTokens["typography.fontFamily.sans"]).toBe(
      "IBM Plex Sans, sans-serif"
    );
    expect(result.mappedTokens["radius.md"]).toBe("0.375rem");
    expect(result.mappedTokens["spacing.lg"]).toBe("1.5rem");
    expect(result.unmappedPaths).toEqual([]);
  });

  it("returns unmapped token paths", () => {
    const result = mapFoundryTokensToWorkbenchPaths({
      "colors.primary": "#111111",
      "unknown.token.path": "42",
      "tokens.not.real": "value",
    });

    expect(result.mappedTokens["colors.primary"]).toBe("#111111");
    expect(result.unmappedPaths).toEqual([
      "tokens.not.real",
      "unknown.token.path",
    ]);
  });
});
