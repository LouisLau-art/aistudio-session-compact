# Compress V2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the old capsule-based compression path with a v2 manual compaction flow that emits `state_snapshot.json`, `preserved_tail.ndjson`, and `compress.report.json`, then render handoff artifacts from the new snapshot+tail model.

**Architecture:** Keep transcript export as the default workflow, and make `compress` a dedicated fallback path. Remove the old capsule write path, add a budget-driven tail selector and snapshot builder, then rewire `handoff` to consume snapshot+tail instead of `context_capsule.json`.

**Tech Stack:** TypeScript, Bun, Commander, Vitest, existing file helpers, existing capture/transcript/briefing infrastructure.

---

### Task 1: Add failing tests for tail selection and snapshot schema

**Files:**
- Create: `tests/compaction.tail.test.ts`
- Create: `tests/state-snapshot.test.ts`
- Reference: `src/types.ts`

**Step 1: Write the failing tests**

Add tests that assert:
- recent-tail selection uses a character budget from the end of the session,
- min/max tail-turn behavior is enforced,
- turns are not split,
- snapshot generation preserves recent state separately from archive,
- briefing data merges into snapshot output.

**Step 2: Run test to verify it fails**

Run: `bun test tests/compaction.tail.test.ts tests/state-snapshot.test.ts`
Expected: FAIL because the new compaction helpers do not exist.

**Step 3: Write minimal implementation**

Create the smallest helper modules needed to satisfy the tests.

**Step 4: Run test to verify it passes**

Run: `bun test tests/compaction.tail.test.ts tests/state-snapshot.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/compaction.tail.test.ts tests/state-snapshot.test.ts src/lib/compaction-tail.ts src/lib/state-snapshot.ts src/types.ts
git commit -m "feat: add compaction tail and snapshot primitives"
```

### Task 2: Replace `compress` with v2 outputs

**Files:**
- Modify: `src/commands/compress.ts`
- Modify: `src/cli.ts`
- Create: `src/lib/state-snapshot.ts` (if not already created in Task 1)
- Create: `src/lib/compaction-tail.ts` (if not already created in Task 1)
- Modify: `src/lib/briefing.ts`
- Test: `tests/compaction.flow.test.ts`

**Step 1: Write the failing flow test**

Add a test that runs `runCompress()` on sample raw input and asserts generation of:
- `state_snapshot.json`
- `preserved_tail.ndjson`
- `compress.report.json`

Also assert text-only compression succeeds when image enrichment is absent.

**Step 2: Run test to verify it fails**

Run: `bun test tests/compaction.flow.test.ts`
Expected: FAIL because `runCompress()` still returns capsule-oriented output.

**Step 3: Write minimal implementation**

Change `compress` to:
- accept `--out-dir` instead of `--out`,
- read optional briefing,
- read optional image enrichment,
- generate `state_snapshot.json`,
- generate `preserved_tail.ndjson`,
- generate `compress.report.json`,
- stop writing `context_capsule.json`.

**Step 4: Run test to verify it passes**

Run: `bun test tests/compaction.flow.test.ts tests/compaction.tail.test.ts tests/state-snapshot.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/commands/compress.ts src/cli.ts src/lib/briefing.ts src/lib/compaction-tail.ts src/lib/state-snapshot.ts tests/compaction.flow.test.ts
git commit -m "feat: replace compress with v2 snapshot and tail outputs"
```

### Task 3: Rebuild `handoff` on top of snapshot + tail

**Files:**
- Modify: `src/commands/handoff.ts`
- Modify: `src/lib/render.ts`
- Modify: `src/cli.ts`
- Create: `tests/handoff.v2.test.ts`
- Remove or migrate: `tests/handoff.compat.test.ts`

**Step 1: Write the failing handoff tests**

Add tests that assert:
- `handoff` reads snapshot + tail,
- `resume_prompt.md` leads with current state and stable background,
- recent tail material is surfaced or clearly referenced,
- archived context remains secondary.

**Step 2: Run test to verify it fails**

Run: `bun test tests/handoff.v2.test.ts`
Expected: FAIL because `handoff` still expects `context_capsule.json`.

**Step 3: Write minimal implementation**

Change `handoff` to:
- accept `--snapshot` and `--tail`,
- optionally accept `--briefing`,
- render markdown from snapshot+tail,
- stop reading `context_capsule.json`.

**Step 4: Run test to verify it passes**

Run: `bun test tests/handoff.v2.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/commands/handoff.ts src/lib/render.ts src/cli.ts tests/handoff.v2.test.ts
git commit -m "feat: rebuild handoff on snapshot and tail"
```

### Task 4: Remove v1 debt

**Files:**
- Delete: `src/lib/capsule.ts`
- Delete: `src/lib/capsule-schema.ts`
- Delete or replace: `tests/capsule.merge.test.ts`
- Delete or replace: `tests/capsule.schema.test.ts`
- Delete or replace: `tests/handoff.render.test.ts`
- Delete or replace: `tests/handoff.compat.test.ts`
- Modify: any imports still referencing capsule code

**Step 1: Identify remaining v1 references**

Run: `rg -n "capsule|ContextCapsule|context_capsule" src tests`
Expected: remaining references still exist.

**Step 2: Remove or migrate them one by one**

Delete v1-only modules and migrate remaining tests to snapshot/tail terminology.

**Step 3: Run focused tests**

Run: `bun test tests/compaction.tail.test.ts tests/state-snapshot.test.ts tests/compaction.flow.test.ts tests/handoff.v2.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
git add src tests
git commit -m "refactor: remove capsule-based compression v1"
```

### Task 5: Update documentation and examples

**Files:**
- Modify: `README.md`
- Create or update: `examples/sample.story_briefing.json`
- Modify: `docs/plans/2026-03-09-compress-v2-design.md`

**Step 1: Write the failing docs checklist**

Verify README currently does not fully describe:
- new `compress --out-dir` semantics,
- `handoff --snapshot --tail` semantics,
- `story_briefing.json` role,
- image failure as non-blocking.

**Step 2: Update docs and examples**

Add the new recommended fallback workflow:
- `compress`
- `handoff`

Show example `story_briefing.json`.

**Step 3: Verify docs references**

Run: `rg -n "context_capsule|capsule|state_snapshot|preserved_tail|story_briefing" README.md examples docs`
Expected: docs reflect v2 semantics.

**Step 4: Commit**

```bash
git add README.md examples/sample.story_briefing.json docs/plans/2026-03-09-compress-v2-design.md
git commit -m "docs: document compress v2 workflow"
```

### Task 6: Full verification

**Files:**
- Modify: none

**Step 1: Run full test suite**

Run: `bun test`
Expected: PASS.

**Step 2: Run lint and build**

Run: `bun run lint && bun run build`
Expected: PASS.

**Step 3: Run local CLI smoke tests**

Run:
```bash
bun run dev -- compress --raw ./examples/sample.raw.ndjson --briefing ./examples/sample.story_briefing.json --out-dir /tmp/compact-v2
bun run dev -- handoff --snapshot /tmp/compact-v2/state_snapshot.json --tail /tmp/compact-v2/preserved_tail.ndjson --briefing ./examples/sample.story_briefing.json --out-dir /tmp/compact-v2
```
Expected: files exist and render without error.

**Step 4: Commit final integration state**

```bash
git add src tests README.md examples docs/plans/2026-03-09-compress-v2-design.md docs/plans/2026-03-09-compress-v2-implementation.md
git commit -m "feat: ship compress v2"
```
