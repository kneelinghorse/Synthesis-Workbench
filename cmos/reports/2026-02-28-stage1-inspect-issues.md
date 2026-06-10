# Stage1 Inspection Issues — Handoff Report

**Date**: 2026-02-28
**Reporter**: Synthesis Workbench team (Sprint 19)
**Severity**: Blocking — prevents E2E validation of Workbench discovery pipeline
**Stage1 MCP bridge**: `http://127.0.0.1:3200/mcp`

---

## Issue 1: inspect_app PARSE_ERROR — app_profile.json not created

### Reproduction

```bash
curl -s -X POST http://127.0.0.1:3200/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"test","method":"tools.call","params":{"name":"stage1_inspect_app","arguments":{"url":"https://derekn.com"}}}'
```

### Actual response

```json
{
  "jsonrpc": "2.0",
  "id": "test",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"error\":true,\"code\":\"PARSE_ERROR\",\"message\":\"Expected app_profile.json to be created, but it was missing\",\"partial\":null}"
      }
    ],
    "isError": true
  }
}
```

### Expected behavior

The inspection should return a run summary with `runId`, `runDir`, `hostname`, and a valid `app_profile.json` artifact in the output directory.

### Evidence this previously worked

`stage1_list_runs` returns **16 completed runs** for `derekn.com`, all with `hasManifest: true` and valid `runDir` paths. The most recent successful run was `2026-02-28T02:42:06.468Z`. Runs after that return the PARSE_ERROR.

### Impact on Workbench

This blocks the enriched discovery pipeline: `inspect_app → extract artifacts → load bundle → populate store`. Without a valid run reference, the pipeline cannot extract `component_clusters.json`, `token_guess.json`, or `style_fingerprint.json`.

---

## Issue 2: Error response format inconsistency

### Problem

Stage1's error response uses `{ error: true, code: "PARSE_ERROR" }` but the documented/expected MCP error patterns use `{ error_code: "..." }` or `{ error: { code: "..." } }`.

The `code` field on the root object is ambiguous — it could be confused with a general-purpose field. The `error: true` boolean flag + `code` combination is non-standard.

### Recommendation

Standardize on one of:

```json
// Option A: Flat with explicit error_code prefix
{ "error_code": "PARSE_ERROR", "error_message": "...", "error_detail": "..." }

// Option B: Nested error object
{ "error": { "code": "PARSE_ERROR", "message": "...", "detail": "..." } }
```

The Workbench now handles all three patterns (`error_code`, `error.code`, and `error: true + code`), but a single convention would prevent future parser drift.

---

## Issue 3: No run reference in error responses

### Problem

When `inspect_app` fails, the response contains no `runId`, `runDir`, or `hostname` — only the error. This means the Workbench cannot:

1. Retrieve partial artifacts from a failed run
2. Show the user which run directory to inspect for debugging
3. Retry with the same run context

### Recommendation

Include run metadata even in error responses when the run was created but failed during processing:

```json
{
  "error": true,
  "code": "PARSE_ERROR",
  "message": "Expected app_profile.json to be created, but it was missing",
  "runId": "...",
  "runDir": "/path/to/run/output",
  "hostname": "derekn.com",
  "partial": { /* any artifacts that WERE created */ }
}
```

---

## Issue 4: No `partial` data returned

### Problem

The `partial` field in the error response is always `null`. If the inspection ran far enough to capture screenshots, DOM snapshots, or style data before failing to produce `app_profile.json`, those partial artifacts would be valuable for debugging and for the Workbench to display intermediate results.

### Recommendation

Populate `partial` with whatever artifacts were successfully created before the failure point.

---

## Workarounds applied in Workbench

1. **Error extraction fix**: `extractInspectionError` now recognizes `{ error: true, code }` in addition to `error_code` and `error.code` patterns.
2. **Error message surfacing**: Pipeline now shows `[PARSE_ERROR] Expected app_profile.json to be created, but it was missing` instead of the generic "Inspection did not produce a run reference."
3. **Timeout increase**: Inspection calls use 120s timeout (programmatic) / 5 min (UI), up from the 15s default for other MCP calls.

---

## Files changed in Workbench (for reference)

- `src/lib/mcp/stage1-client.ts` — error extraction + timeout
- `src/lib/stage1/inspection-pipeline.ts` — error message propagation
- `src/lib/mcp/stage1-client.test.ts` — 2 new tests
- `src/lib/stage1/inspection-pipeline.test.ts` — 2 new tests
- **949 tests passing** across 89 test files
