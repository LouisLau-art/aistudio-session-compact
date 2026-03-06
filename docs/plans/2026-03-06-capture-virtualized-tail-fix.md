# Capture Virtualized Tail Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `capture` reliably preserve the latest turns in long AI Studio sessions and improve image harvesting under virtualized scrolling.

**Architecture:** Replace the single-snapshot extraction flow with a bottom-first recent pass plus an overlapping historical sweep across scroll positions. Deduplicate turn observations in Node, and collect visible image screenshots during the same sweep so OCR has real local files when possible.

**Tech Stack:** TypeScript, Playwright over CDP, Vitest

---

### Task 1: Add failing tests for sweep planning and turn merging

**Files:**
- Modify: `tests/capture.extract.test.ts`
- Create or modify: `src/commands/capture.ts`

**Step 1: Write the failing tests**
- Add a test for a pure helper that computes scroll positions and asserts:
  - bottom-most position is included first
  - multiple positions are produced for large scroll ranges
  - top position is included
- Add a test for a pure helper that merges repeated turn observations and keeps the longer text.

**Step 2: Run test to verify it fails**
- Run: `bun test tests/capture.extract.test.ts`
- Expected: FAIL because the new helpers do not exist yet.

**Step 3: Write minimal implementation**
- Export the pure helpers from `src/commands/capture.ts`.
- Implement only enough logic to satisfy the tests.

**Step 4: Run test to verify it passes**
- Run: `bun test tests/capture.extract.test.ts`
- Expected: PASS

### Task 2: Replace single snapshot extraction with sweep-based harvesting

**Files:**
- Modify: `src/commands/capture.ts`
- Test: `tests/capture.extract.test.ts`

**Step 1: Write the failing test**
- Add a unit test for turn observation merging behavior that models multiple snapshots from different scroll positions.

**Step 2: Run test to verify it fails**
- Run: `bun test tests/capture.extract.test.ts`
- Expected: FAIL on missing or incorrect merge behavior.

**Step 3: Write minimal implementation**
- Introduce a sweep loop that:
  - preserves bottom state first
  - iterates computed scroll positions
  - harvests rendered turns at each position
  - merges observations in Node
- Keep the existing fallback selector extraction for degenerate cases.

**Step 4: Run test to verify it passes**
- Run: `bun test tests/capture.extract.test.ts`
- Expected: PASS

### Task 3: Harvest images during the sweep

**Files:**
- Modify: `src/commands/capture.ts`
- Test: `tests/capture.extract.test.ts`

**Step 1: Write the failing test**
- Add a small unit test for source filtering / attachment behavior so duplicate image sources are handled consistently.

**Step 2: Run test to verify it fails**
- Run: `bun test tests/capture.extract.test.ts`
- Expected: FAIL

**Step 3: Write minimal implementation**
- Move image harvesting into the sweep path.
- Reuse a saved-by-source map so screenshots are attempted while images are visible.
- Keep best-effort semantics, but stop depending on one final visibility state.

**Step 4: Run test to verify it passes**
- Run: `bun test tests/capture.extract.test.ts`
- Expected: PASS

### Task 4: Validate end-to-end behavior and safety

**Files:**
- Modify: `src/commands/capture.ts` if needed
- Reference: `docs/plans/2026-03-06-capture-virtualized-tail-fix-design.md`

**Step 1: Run targeted tests**
- Run: `bun test tests/capture.extract.test.ts`
- Expected: PASS

**Step 2: Run full verification**
- Run: `bun test && bun run lint && bun run build`
- Expected: all PASS

**Step 3: If CDP is reproducible locally, run a fresh capture smoke test**
- Run an existing capture command against the AI Studio tab.
- Verify the latest raw tail grows beyond the previously missing boundary when the browser environment cooperates.

**Step 4: Commit**
```bash
git add src/commands/capture.ts tests/capture.extract.test.ts docs/plans/2026-03-06-capture-virtualized-tail-fix-design.md docs/plans/2026-03-06-capture-virtualized-tail-fix.md
git commit -m "Fix virtualized AI Studio capture sweep"
```
