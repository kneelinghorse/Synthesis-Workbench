# Foundry Component Catalog Integration

The Workbench now discovers OODS component metadata from Foundry at runtime using:

- Tool: `structuredData.fetch`
- Dataset: `components`
- Endpoint: `OODS_FOUNDRY_MCP_URL` (bridge `/run` or JSON-RPC `/mcp`)

## What Is Collected

For each component in the Foundry structured dataset payload, the Workbench derives:

- `name`: `displayName` fallback to `id`
- `traits`: unique `traitUsages[].trait`
- `requiredProps`: union of:
  - explicit `requiredProps[]` (if present)
  - all keys in `traitUsages[].props`
- `variants`: union of `contexts[]`, `regions[]`, and `variants[]`
- `categories` and `tags` (when available)

This produces a normalized component catalog used by the LLM prompt.

## Prompt Injection

`ResearchContext` appends an **OODS COMPONENT CATALOG (FOUNDRY)** section to the system prompt when catalog fetch succeeds.

Each component is rendered as:

`oods:<Name> — traits: <...>; required props: <...>; variants: <...>`

This ensures composition decisions are grounded in the real Foundry palette rather than a static hand-maintained list.

## Verification

Catalog support is validated by tests in:

- `src/lib/foundry/catalog.test.ts`
- `src/lib/runtime/ResearchContext.test.tsx`
- `src/lib/mcp/foundry-client.test.ts`
