# Project Persistence Model (Sprint 10)

This document defines the canonical project persistence shape for Synthesis Workbench.

## Directory Layout

```text
./projects/{project-slug}/
  project.yaml                  # ProjectManifest
  designs/
    {design-slug}.design.yaml   # DesignDocument files owned by this project
  templates/
    {template-slug}.template.yaml # DesignTemplate reusable blueprints
  state/
    tokens.yaml                 # ProjectTokenLedger (token snapshots keyed by design slug)
    bundle.yaml                 # Stage1 bundle association metadata + cached bundle payload
    data-contexts.yaml          # Persisted ProjectDataContextEntry[]
```

## Relationship Model

`ProjectManifest.relationships` is the source of truth for project links:

- `designs[]`:
  - Per-design metadata (slug/title/description/timestamps)
  - Relative `file` path to each persisted design document
- `tokensFile`:
  - Relative path to project token ledger file
  - Ledger stores `{ byDesign: { [slug]: ProjectTokenState } }`
- `bundleFile`:
  - Relative path to project Stage1 association file
  - Stores `sourceRun` metadata (`runId`, hostname, timestamp) and cached bundle payload
- `dataContextsFile`:
  - Relative path to serialized data context entries

This makes project -> designs/tokens/bundle/data-context links explicit and serializable.

Template files are intentionally distinct from design instances:
- Design instance: top-level `metadata` + `root` (`DesignDocument`)
- Template: top-level `kind: template` + nested `document` (`DesignTemplate`)
- See `docs/template-format-spec.md` for the canonical template schema.

## Migration Path From Legacy `./designs/`

The migration workflow is implemented in `src/lib/persistence/project-migration.ts`.

1. Read existing legacy designs from `./designs/*.design.yaml`
2. Build a migration plan (`buildLegacyDesignMigrationPlan`) with source/target mapping
3. Scaffold `./projects/{slug}/` layout + default state files
4. Copy legacy designs into `./projects/{slug}/designs/`
5. Write `project.yaml` with relationships pointing to project-scoped files
6. Keep legacy `./designs/` files intact during sprint 10 for rollback safety

`migrateLegacyDesignsToProject` supports `dryRun: true` to validate migration plans without writing files.

## Token Persistence (Per Design)

Token snapshots are persisted per design under `state/tokens.yaml`:

```yaml
byDesign:
  home:
    values: ...
    changes: ...
    history: ...
    updatedAt: "..."
activeDesignSlug: home
updatedAt: "..."
```

- `values` preserves full `TokenState` including `custom.*` keys
- `history` records ordered token edits for undo/audit workflows
- `changes` captures current diff from default tokens

Runtime restore helper: `restoreProjectDesignState(projectSlug, slug)` hydrates:
- `document-state` (DesignDocument)
- `data-context` (DesignDocument.data)
- `token-state` (values + changes + history)
