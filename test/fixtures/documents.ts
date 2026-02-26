/**
 * Reusable DesignDocument Fixtures
 *
 * Pre-built documents for integration testing composition,
 * export, and document tool workflows.
 */

import type { DesignDocument } from "@/types/document-model";

/**
 * A multi-component dashboard layout with nested grid.
 * Tests the full composition pipeline with mixed layout and component nodes.
 */
export const DASHBOARD_DOCUMENT: DesignDocument = {
  metadata: {
    title: "Dashboard",
    description: "Integration test dashboard",
    version: "1.0.0",
  },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: "1.5rem" },
    children: [
      {
        nodeType: "component",
        id: "nav-1",
        ref: "oods:Navbar",
        props: { brand: "TestApp", variant: "dark" },
      },
      {
        nodeType: "layout",
        layout: { type: "grid", columns: 3, gap: "1rem" },
        children: [
          {
            nodeType: "component",
            id: "metric-users",
            ref: "oods:MetricCard",
            props: { label: "Users", value: "1,234" },
          },
          {
            nodeType: "component",
            id: "metric-revenue",
            ref: "oods:MetricCard",
            props: { label: "Revenue", value: "$42k" },
          },
          {
            nodeType: "component",
            id: "metric-growth",
            ref: "oods:MetricCard",
            props: { label: "Growth", value: "+15%" },
          },
        ],
      },
      {
        nodeType: "component",
        id: "table-1",
        ref: "oods:DataTable",
        props: { columns: 5, rows: 10 },
      },
    ],
  },
};

/**
 * A single-component document for simple test cases.
 */
export const SINGLE_BUTTON_DOCUMENT: DesignDocument = {
  metadata: {
    title: "Button Test",
  },
  root: {
    nodeType: "component",
    id: "btn-1",
    ref: "oods:Button",
    props: { label: "Click me", variant: "primary" },
  },
};

/**
 * A document with data binding expressions.
 * Tests the data context / binding integration.
 */
export const BINDING_DOCUMENT: DesignDocument = {
  metadata: {
    title: "Data Binding Test",
  },
  root: {
    nodeType: "layout",
    layout: { type: "stack" },
    children: [
      {
        nodeType: "component",
        id: "greeting",
        ref: "oods:Heading",
        props: { text: "$data.user.name" },
      },
      {
        nodeType: "component",
        id: "status",
        ref: "oods:Badge",
        props: { label: "$data.user.role" },
      },
    ],
  },
  data: {
    user: {
      name: "Alice",
      role: "Admin",
    },
  },
};
