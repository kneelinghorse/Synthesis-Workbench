# Template Format Specification (Sprint 12)

This document defines the canonical reusable template file format for Synthesis Workbench.

## Design vs Template

- `DesignDocument` (`*.design.yaml`):
  - Editable instance document
  - Top-level fields: `metadata`, `root`, optional `data`
- `DesignTemplate` (`*.template.yaml`):
  - Reusable starter blueprint
  - Top-level `kind: template`
  - Wraps a `document` skeleton plus reusable template-specific metadata and requirements

Template files are intentionally not parseable as design instances.

## Template YAML Shape

```yaml
kind: template
metadata:
  name: Dashboard Starter
  description: Reusable analytics dashboard starter
  category: dashboard
  previewThumbnail: /thumbnails/dashboard-starter.png
  tags:
    - analytics
    - kpi
document:
  metadata:
    title: Dashboard Starter
    description: Reusable dashboard scaffold
  root:
    nodeType: layout
    layout:
      type: stack
      gap: 16
    children:
      - nodeType: component
        id: card-1
        ref: oods:Card
        props:
          title: Revenue
      - nodeType: component
        id: btn-1
        ref: oods:Button
        props:
          label: Refresh
tokenOverrides:
  colors.primary: "#0055ff"
  spacing.md: "1rem"
dataShape:
  user:
    type: object
    required: true
    description: Current user payload
  metrics:
    type: array
    required: true
requiredComponents:
  - oods:Card
  - oods:Button
```

## Validation Rules

- `kind` must be `template`
- `metadata.name`, `metadata.description`, and `metadata.category` are required
- `document` must be a valid `DesignDocument` skeleton
- `requiredComponents` entries must:
  - match `oods:ComponentName` format
  - be unique
  - exist in `document` component refs
- `dataShape` defines expected input data keys and type hints

## Built-in Templates

Sprint 12 ships these built-in slugs out of the box:

- `dashboard`
- `form-page`
- `landing-page`
- `settings-panel`
- `detail-view`

Quick apply flow in chat:

1. Load bundle context: `/bundle`
2. Move to explore phase (if needed)
3. Apply built-in template: `/doc template dashboard`

Save active design as a reusable custom template:

`/template save {"name":"Ops Dashboard","description":"Operations starter","category":"dashboard","slug":"ops-dashboard"}`
