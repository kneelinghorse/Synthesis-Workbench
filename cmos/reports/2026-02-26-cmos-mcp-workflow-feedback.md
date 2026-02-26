# CMOS MCP Workflow Feedback Report

**Date**: 2026-02-26
**Author**: Agent (Sprint 13 Review Session PS-2026-02-26-014)
**Target**: CMOS MCP development team

---

## 1. Context Capacity Management (Critical)

### Problem
`master_context` grows monotonically as missions complete and sessions capture insights. There is no built-in condensation or archival mechanism. After 13 sprints, Synthesis Workbench is at **85.6% of the 100KB limit**.

### What We Need
- **`cmos_context_condense`** tool: Summarize older sprint data into compressed form, archive detail to snapshots, and free capacity. Should be safe to run at any time (idempotent, non-destructive).
- **Automatic capacity warnings** at session start when above threshold (e.g., 75%). Currently only shown in `cmos_agent_onboard` warnings array — easy to miss.
- **Configurable retention policy**: e.g., "keep last 3 sprints in full detail, condense older sprints to summary-only."

### Current Workaround
Manual editing of context via external tools. Fragile and error-prone.

---

## 2. Mission Feedback/Capture Gating (High Priority)

### Problem
Missions transition directly from `In Progress` to `Completed` without any mandatory feedback capture step. There is no structured mechanism to record what was learned, what went wrong, or what decisions were made *at the mission level*.

Session captures exist but are orthogonal to missions — you can complete a mission without capturing anything.

### What We Need
- **Mission-level capture gating**: Before `cmos_mission_complete()` succeeds, require or prompt for at least one capture (learning, decision, or constraint) associated with that mission.
- **`cmos_mission_capture`** tool: Like `cmos_session_capture` but scoped to a specific mission ID. These get aggregated into context when the mission completes.
- Optional: A `completionNotes` field on `cmos_mission_complete` that auto-creates a capture.

### Benefit
Prevents "fire and forget" mission completion. Forces context accumulation at the natural work boundary.

---

## 3. Context View Output Size (Medium)

### Problem
`cmos_context_view()` returns the full merged context as a single JSON blob. For projects with significant history (like ours at 85KB master + 22KB project), this **exceeds MCP tool output limits** and requires fallback to file-based reading with pagination.

### What We Need
- **Pagination support** on `cmos_context_view`: e.g., `section` parameter to request only `decisions`, `constraints`, `learnings`, or `sprint_summaries` individually.
- **Compact mode**: Return a summary digest (key decisions, active constraints, recent learnings) instead of full history. Useful for agent onboarding without consuming half the context window.

### Current Workaround
Read the overflow file with Grep for specific patterns. Works but slow and brittle.

---

## 4. Sprint Completion Automation (Nice to Have)

### Problem
Completing a sprint requires multiple manual steps:
1. Verify all missions completed
2. Start a review session
3. Capture learnings
4. Complete session
5. Update sprint status
6. Take context snapshot

### Suggestion
- **`cmos_sprint_review`** composite tool: Validates mission status, starts a review session, prompts for captures, completes session, updates sprint, and snapshots — in one guided flow.
- Not a full automation (agent should still drive content), but a guardrail that ensures no steps are skipped.

---

## 5. Decision Tracking Gap (Low Priority)

### Problem
Sprint 13 had zero decisions recorded via `cmos_decisions_list`, yet significant architectural decisions were made (fragment adapter as primary path, composition mode deprecated, `"*"` wildcard security model for sandboxed iframes). These were captured in session captures but not in the decisions table.

### Suggestion
- Make it easier to promote a session capture (category: "decision") to a formal decision record.
- Or: auto-populate decisions table from session captures with `category: "decision"`.

---

## Summary Table

| Issue | Priority | Type |
|-------|----------|------|
| Context capacity management | Critical | New tool needed |
| Mission feedback/capture gating | High | Workflow change |
| Context view pagination/compact mode | Medium | API enhancement |
| Sprint completion automation | Nice to have | Composite tool |
| Decision tracking auto-population | Low | Data pipeline |
