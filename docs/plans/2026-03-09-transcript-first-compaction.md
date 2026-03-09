# Transcript-First Session Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make transcript export the primary workflow by adding first-class transcript artifacts and a transcript-oriented export path, while keeping existing compaction commands available as secondary tools.

**Architecture:** Add a dedicated transcript rendering layer that consumes `session.raw.ndjson` plus optional image enrichment and emits `transcript.txt`, `transcript.md`, and `transcript.report.json`. Expose that layer through a new CLI command and a transcript-oriented wrapper path, while leaving current `compress` and `handoff` code intact for manual fallback use.

**Tech Stack:** TypeScript, Bun, Commander, Vitest, existing NDJSON/JSON file helpers.

---

### Task 1: Add failing tests for transcript rendering

**Files:**
- Create: `tests/transcript.render.test.ts`
- Modify: `tests/briefing.flow.test.ts` (only if a shared fixture helper is worth reusing)
- Reference: `src/types.ts`

**Step 1: Write the failing tests**

Add tests that assert:
- `transcript.txt` preserves turn order and role labels.
- `transcript.md` renders readable headers and message blocks.
- OCR text is appended only when `ImageEnrichment.status === "ok"` and OCR content exists.
- Missing image enrichment does not inject placeholder noise.

**Step 2: Run test to verify it fails**

Run: `bun test tests/transcript.render.test.ts`
Expected: FAIL because transcript render helpers do not exist yet.

**Step 3: Write minimal implementation**

Create transcript render helpers with the smallest surface needed to satisfy the tests.

**Step 4: Run test to verify it passes**

Run: `bun test tests/transcript.render.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/transcript.render.test.ts src/lib/transcript.ts
git commit -m "feat: add transcript renderers"
```

### Task 2: Implement transcript library and command

**Files:**
- Create: `src/lib/transcript.ts`
- Create: `src/commands/transcript.ts`
- Modify: `src/cli.ts`
- Modify: `src/lib/fs.ts` (only if helper reuse is justified)
- Test: `tests/transcript.render.test.ts`

**Step 1: Write the failing command-level test**

Add a test that writes a temporary `session.raw.ndjson`, runs the transcript command function, and asserts creation of:
- `transcript.txt`
- `transcript.md`
- `transcript.report.json`

**Step 2: Run test to verify it fails**

Run: `bun test tests/transcript.render.test.ts`
Expected: FAIL because `runTranscript` does not exist.

**Step 3: Write minimal implementation**

Implement:
- a transcript normalizer that attaches OCR snippets without mutating the source turns in surprising ways,
- `renderTranscriptText(turns)`,
- `renderTranscriptMarkdown(turns)`,
- `runTranscript({ rawPath, imagesPath?, outDir })`.

Wire a new CLI command:

```bash
bun run dev -- transcript --raw ./out/session.raw.ndjson --out-dir ./out
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/transcript.render.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/transcript.ts src/commands/transcript.ts src/cli.ts tests/transcript.render.test.ts
git commit -m "feat: add transcript export command"
```

### Task 3: Add a transcript-oriented wrapper workflow

**Files:**
- Create: `src/commands/exportTranscript.ts`
- Modify: `src/cli.ts`
- Modify: `package.json`
- Create: `scripts/run-headless-transcript-export.sh`
- Test: `tests/export.transcript.flow.test.ts`
- Reference: `src/commands/capture.ts`, `src/commands/enrichImages.ts`, `src/commands/transcript.ts`

**Step 1: Write the failing flow test**

Add a test for the wrapper function that stubs capture/enrichment/transcript stages and asserts the wrapper writes a report containing:
- `rawPath`
- `imagesPath` when applicable
- `transcriptTxtPath`
- `transcriptMdPath`

**Step 2: Run test to verify it fails**

Run: `bun test tests/export.transcript.flow.test.ts`
Expected: FAIL because the wrapper command does not exist.

**Step 3: Write minimal implementation**

Implement a transcript-first wrapper command that runs:
- `capture`
- optional `enrich-images`
- `transcript`

Add a Bun script for the headless common path, analogous to the existing pipeline wrapper, but targeted at transcript export.

**Step 4: Run test to verify it passes**

Run: `bun test tests/export.transcript.flow.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/commands/exportTranscript.ts src/cli.ts package.json scripts/run-headless-transcript-export.sh tests/export.transcript.flow.test.ts
git commit -m "feat: add transcript-first export workflow"
```

### Task 4: Update product docs to make transcript-first the default recommendation

**Files:**
- Modify: `README.md`
- Reference: `docs/plans/2026-03-09-transcript-first-compaction-design.md`

**Step 1: Write the failing docs checklist**

Create a short checklist inside the task notes and verify the README does not yet satisfy it:
- transcript export shown before compaction,
- headless transcript workflow documented,
- compaction described as optional fallback,
- outputs section includes transcript artifacts.

**Step 2: Run manual verification to confirm docs are outdated**

Run: `rg -n "transcript|pipeline:headless|compress" README.md`
Expected: transcript-first workflow is missing or secondary.

**Step 3: Write minimal implementation**

Update the README so the primary documented path is transcript export. Keep compaction docs, but explicitly label them as secondary/fallback workflow.

**Step 4: Run verification**

Run: `rg -n "transcript|pipeline:headless|compress" README.md`
Expected: transcript workflow appears before compaction workflow.

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: make transcript export the default workflow"
```

### Task 5: Full verification

**Files:**
- Modify: none
- Test: `tests/transcript.render.test.ts`
- Test: `tests/export.transcript.flow.test.ts`
- Reference: existing test suite

**Step 1: Run focused tests**

Run: `bun test tests/transcript.render.test.ts tests/export.transcript.flow.test.ts`
Expected: PASS.

**Step 2: Run full test suite**

Run: `bun test`
Expected: PASS.

**Step 3: Run lint and build**

Run: `bun run lint && bun run build`
Expected: PASS.

**Step 4: Commit final integration state**

```bash
git add src tests scripts package.json README.md docs/plans/2026-03-09-transcript-first-compaction-design.md docs/plans/2026-03-09-transcript-first-compaction.md
git commit -m "feat: add transcript-first session export"
```

## Deferred Follow-Up
Manual compaction v2 is intentionally deferred to a later plan. That follow-up should add:
- `story_briefing.json`
- `state_snapshot.json`
- `preserved_tail.ndjson`
- `replacement_history.json`

Those artifacts should build on the transcript-first product posture instead of replacing it.
