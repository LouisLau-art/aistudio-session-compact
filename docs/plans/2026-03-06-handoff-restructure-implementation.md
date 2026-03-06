# Handoff Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make handoff artifacts continuation-oriented by separating current state from historical archive.

**Architecture:** Extend `ContextCapsule` with handoff-focused sections computed from recent chunks plus a smaller appendix derived from older context. Update renderers to use the new sections as the primary narrative while keeping the heuristic summarizer as the local baseline.

**Tech Stack:** Bun, TypeScript, Vitest.

---

### Task 1: Add failing tests for handoff-oriented capsule sections

**Files:**
- Modify: `tests/capsule.merge.test.ts`
- Modify: `tests/handoff.render.test.ts`

**Step 1: Write the failing test**
Add tests for:
- `currentState` prioritizing recent chunk content
- `stableDecisions` rendering separately from archive
- `recentTimeline` using latest checkpoints only
- `appendix` holding historical context
- render output section order

**Step 2: Run test to verify it fails**
Run: `bun test tests/capsule.merge.test.ts tests/handoff.render.test.ts`
Expected: FAIL because new fields/sections do not exist yet.

**Step 3: Commit**
Do not commit yet.

### Task 2: Extend capsule schema and builder

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/capsule.ts`

**Step 1: Implement minimal schema additions**
Add `currentState`, `stableDecisions`, `recentTimeline`, and `appendix` to `ContextCapsule`.

**Step 2: Implement minimal builder logic**
- derive recent-window sections from latest chunk summaries
- derive durable/stable decisions from all chunks with recency bias
- derive appendix from older chunk summaries
- keep old fields for compatibility where useful

**Step 3: Run targeted tests**
Run: `bun test tests/capsule.merge.test.ts`
Expected: PASS

### Task 3: Update markdown renderers

**Files:**
- Modify: `src/lib/render.ts`
- Test: `tests/handoff.render.test.ts`

**Step 1: Implement render changes**
Make `resume_prompt.md` and `handoff.md` lead with:
- Current State
- Stable Decisions
- Active Constraints
- Active Open Questions
- Recent Timeline
- Appendix

**Step 2: Run targeted tests**
Run: `bun test tests/handoff.render.test.ts`
Expected: PASS

### Task 4: Run full verification and real-session regeneration

**Files:**
- No source file required beyond previous tasks

**Step 1: Run full verification**
Run:
- `bun test`
- `bun run lint`
- `bun run build`

**Step 2: Re-run real-session compression**
Reuse the best captured `session.raw.ndjson` and regenerate:
- `context_capsule.json`
- `handoff.md`
- `resume_prompt.md`

**Step 3: Manual inspection**
Check that the new handoff answers these quickly:
- what is the current state?
- what decisions are stable?
- what should the next model continue with?

### Task 5: Request review and finalize

**Files:**
- Review current diff only

**Step 1: Request code review**
Use explorer/code-review workflow on the current diff.

**Step 2: Fix issues if needed**
Address high/important findings.

**Step 3: Commit and push**
Commit only source/test/doc changes, not experiment output directories.
