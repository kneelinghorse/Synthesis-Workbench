/**
 * Reusable Stage1 Bundle Fixtures
 *
 * Pre-built bundles for integration testing the full pipeline:
 * bundle load → token seed → document → validate → render → export.
 */

import type { Stage1BundlePayload } from "@/types/stage1-bundle";

/**
 * A realistic Stage1 bundle with token guesses, components, and artifacts.
 * Suitable for testing the full ingest → seed pipeline.
 */
export const DASHBOARD_BUNDLE: Stage1BundlePayload = {
  manifest: {
    contractVersion: "1.0.0",
    generatedAt: "2025-01-15T10:00:00.000Z",
    targets: [{ name: "dashboard-app", url: "https://dashboard.example.com" }],
  },
  synthesis: {
    tokenGuess: {
      colors: {
        primary: "#2563eb",
        secondary: "#64748b",
        accent: "#f59e0b",
        background: "#f8fafc",
        surface: "#ffffff",
      },
      typography: {
        fontFamily: {
          sans: "Inter, system-ui, sans-serif",
          mono: "Fira Code, monospace",
        },
        fontSize: {
          base: "1rem",
          lg: "1.125rem",
        },
      },
      spacing: {
        sm: "0.5rem",
        md: "1rem",
        lg: "1.5rem",
      },
    },
    components: [
      { name: "Navbar", count: 1 },
      { name: "MetricCard", count: 3 },
      { name: "DataTable", count: 1 },
    ],
  },
  artifacts: [
    {
      id: "component-clusters",
      path: "component-clusters.json",
      type: "component-clusters",
      payload: {
        components: [
          { name: "Navbar", count: 1 },
          { name: "MetricCard", count: 3 },
          { name: "DataTable", count: 1 },
          { name: "Button", count: 8 },
        ],
      },
    },
  ],
};

/**
 * Minimal valid bundle with just a manifest.
 * Useful for testing empty-bundle edge cases.
 */
export const MINIMAL_BUNDLE: Stage1BundlePayload = {
  manifest: {
    contractVersion: "1.0.0",
  },
};

/**
 * Bundle with a style fingerprint (no token guess).
 * Tests the fingerprint → token extraction fallback path.
 */
export const FINGERPRINT_ONLY_BUNDLE: Stage1BundlePayload = {
  manifest: {
    contractVersion: "1.0.0",
  },
  styleFingerprint: {
    kind: "style_fingerprint",
    colors: {
      text: [
        { value: "#1a1a1a", token: true },
        { value: "#666666", token: false },
      ],
      background: [
        { value: "#ffffff", token: true },
      ],
    },
    type_scale: {
      font_families: [
        { value: "Helvetica Neue, sans-serif", count: 12 },
      ],
    },
    spacing_scale: {
      padding: [
        { value: "8px", count: 20 },
        { value: "16px", count: 15 },
      ],
      margin: [],
    },
  },
};
