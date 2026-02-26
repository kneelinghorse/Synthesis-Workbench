import { describe, it, expect } from "vitest";
import { mapStage1ToOODS, inferTraitsFromStyles, mapTokenPath } from "./mapping-utils";

describe("mapping-utils", () => {
    describe("mapStage1ToOODS", () => {
        it("maps exact matches correctly", () => {
            const result = mapStage1ToOODS({ name: "primary-button", source: "test" });
            expect(result?.component).toBe("Button");
            expect(result?.traits.intent).toBe("primary");
        });

        it("handles fuzzy matching for similar names", () => {
            const result = mapStage1ToOODS({ name: "Submit Button", source: "test" });
            expect(result?.component).toBe("Button");
        });

        it("returns null for unknown components", () => {
            const result = mapStage1ToOODS({ name: "Unknown Element", source: "test" });
            expect(result).toBeNull();
        });
    });

    describe("inferTraitsFromStyles", () => {
        it("infers rounded shape from border-radius", () => {
            const traits = inferTraitsFromStyles({ "border-radius": "12px" });
            expect(traits.shape).toBe("rounded");
        });

        it("infers tight density from small padding", () => {
            const traits = inferTraitsFromStyles({ "padding": "2px" });
            expect(traits.density).toBe("tight");
        });

        it("infers high emphasis from bold font-weight", () => {
            const traits = inferTraitsFromStyles({ "font-weight": "700" });
            expect(traits.emphasis).toBe("high");
        });
    });

    describe("mapTokenPath", () => {
        it("maps known color paths", () => {
            expect(mapTokenPath("colors.primary")).toBe("theme.colors.brand.primary");
        });

        it("returns original path if no mapping exists", () => {
            expect(mapTokenPath("custom.other")).toBe("custom.other");
        });
    });
});
