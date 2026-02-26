import { Stage1Component } from "@/types/stage1-bundle";

export type OODSTraitValue = string | number | boolean;
export type OODSComponentMapping = {
    component: string;
    traits: Record<string, OODSTraitValue>;
};

const COMPONENT_MAP: Record<string, OODSComponentMapping> = {
    "primary-button": {
        component: "Button",
        traits: { intent: "primary", size: "md" },
    },
    "secondary-button": {
        component: "Button",
        traits: { intent: "secondary" },
    },
    "navigation-menu": {
        component: "Navigation",
        traits: { layout: "horizontal" },
    },
    "input-field": {
        component: "Form.Input",
        traits: { variant: "outline" },
    },
    "data-table": {
        component: "Table",
        traits: { density: "comfortable" },
    },
    "side-bar": {
        component: "Navigation",
        traits: { layout: "vertical" },
    },
};

/**
 * Maps a Stage1 component name/id to an OODS component and traits.
 */
export const mapStage1ToOODS = (component: Stage1Component): OODSComponentMapping | null => {
    const name = component.name.toLowerCase().replace(/\s+/g, '-');

    // Direct lookup
    if (COMPONENT_MAP[name]) {
        return COMPONENT_MAP[name];
    }

    // Fuzzy matching/logic
    if (name.includes("button")) {
        return COMPONENT_MAP["primary-button"];
    }

    if (name.includes("nav") || name.includes("menu")) {
        return COMPONENT_MAP["navigation-menu"];
    }

    if (name.includes("input") || name.includes("field")) {
        return COMPONENT_MAP["input-field"];
    }

    if (name.includes("table") || name.includes("list")) {
        return COMPONENT_MAP["data-table"];
    }

    return null;
};

/**
 * Infers OODS traits from Stage1 style fingerprint data.
 */
export const inferTraitsFromStyles = (styles: Record<string, any>): Record<string, OODSTraitValue> => {
    const traits: Record<string, OODSTraitValue> = {};

    const borderRadius = parseFloat(styles["border-radius"] || "0");
    if (borderRadius > 8) {
        traits["shape"] = "rounded";
    }

    const padding = parseFloat(styles["padding"] || "8");
    if (padding < 4) {
        traits["density"] = "tight";
    }

    const fontWeight = parseInt(styles["font-weight"] || "400", 10);
    if (fontWeight > 600) {
        traits["emphasis"] = "high";
    }

    return traits;
};

/**
 * Maps Stage1 token paths to OODS token paths based on the spec.
 */
export const mapTokenPath = (path: string): string => {
    const pathMap: Record<string, string> = {
        "colors.primary": "theme.colors.brand.primary",
        "colors.surface": "theme.colors.ui.surface",
        "spacing.md": "theme.spacing.md",
        "typography.sans": "theme.typography.family.sans",
    };

    return pathMap[path] || path;
};
