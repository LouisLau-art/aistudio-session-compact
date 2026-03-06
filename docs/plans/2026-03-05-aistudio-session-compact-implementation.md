# AI Studio Session Compact Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-usable CLI that captures large AI Studio sessions, enriches images, compresses context, and emits restart artifacts.

**Architecture:** A TypeScript CLI (Bun runtime) with explicit subcommands for `capture`, `enrich-images`, `compress`, and `handoff`, connected by stable JSON/NDJSON contracts. Each stage is resumable and writes auditable artifacts for debugging and trust.

**Tech Stack:** Bun, TypeScript, Playwright (CDP), Doubao-compatible vision endpoint, Zod, Vitest.

**Agent Rule:** Use repository skills first; use Context7 for doc-sensitive third-party API decisions.

## Update 2026-03-06

- Added strict capture quality gate (default on) to prevent low-quality extraction from silently flowing into compression/handoff.
- Added CLI/pipeline escape hatch `--no-strict-capture` (and headless wrapper env `STRICT_CAPTURE=0`) for raw debugging.
- Tightened extraction noise filtering for attachment metadata (`User docs ... tokens`), `Model Thoughts`, and AI Studio watermark images.
- Added virtual-list-aware capture path for `ms-chat-turn` (segment scanning) to handle AI Studio lazy rendering.
- Added screenshot cap `--max-image-screenshots` (`MAX_IMAGE_SCREENSHOTS` in headless wrapper) and skip-image stage when no turn images are referenced.

---

### Task 1: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

**Step 1: Write the failing test**
Create a smoke test entry for CLI invocation that expects no throw on `--help`.

**Step 2: Run test to verify it fails**
Run: `bun run test`
Expected: FAIL because project/test harness is not initialized.

**Step 3: Write minimal implementation**
Add scripts, TS config, and test harness wiring.

**Step 4: Run test to verify it passes**
Run: `bun run test`
Expected: PASS for bootstrap smoke.

**Step 5: Commit**
`git commit -m "chore: bootstrap aistudio-session-compact cli"`

### Task 2: Capture Command (CDP)

**Files:**
- Create: `src/cli.ts`
- Create: `src/commands/capture.ts`
- Create: `src/lib/cdp.ts`
- Create: `src/lib/extract.ts`
- Test: `tests/capture.extract.test.ts`

**Step 1: Write the failing test**
Add extractor test with HTML fixture expecting normalized turns.

**Step 2: Run test to verify it fails**
Run: `bun run test`
Expected: FAIL; extractor missing.

**Step 3: Write minimal implementation**
Implement tab selection, auto-scroll stabilization, DOM extraction, NDJSON writer.

**Step 4: Run test to verify it passes**
Run: `bun run test`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat: add cdp capture and turn extraction"`

### Task 3: Image Enrichment

**Files:**
- Create: `src/commands/enrichImages.ts`
- Create: `src/lib/doubao.ts`
- Test: `tests/enrich.prompt.test.ts`

**Step 1: Write the failing test**
Assert prompt builder includes OCR, visual summary, and strict JSON request.

**Step 2: Run test to verify it fails**
Run: `bun run test`
Expected: FAIL.

**Step 3: Write minimal implementation**
Implement image iteration, model call, JSONL output, per-image error recording.

**Step 4: Run test to verify it passes**
Run: `bun run test`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat: add multimodal image enrichment"`

### Task 4: Hierarchical Compression

**Files:**
- Create: `src/commands/compress.ts`
- Create: `src/lib/chunking.ts`
- Create: `src/lib/capsule.ts`
- Test: `tests/chunking.test.ts`
- Test: `tests/capsule.merge.test.ts`

**Step 1: Write the failing test**
Test chunk budget behavior and deterministic merge semantics.

**Step 2: Run test to verify it fails**
Run: `bun run test`
Expected: FAIL.

**Step 3: Write minimal implementation**
Implement chunk splitter, chunk summarizer calls, global merge and schema output.

**Step 4: Run test to verify it passes**
Run: `bun run test`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat: add hierarchical compression and capsule schema"`

### Task 5: Handoff Generation

**Files:**
- Create: `src/commands/handoff.ts`
- Create: `src/lib/render.ts`
- Test: `tests/handoff.render.test.ts`

**Step 1: Write the failing test**
Assert generated markdown includes summary, decisions, open questions, and resume prompt block.

**Step 2: Run test to verify it fails**
Run: `bun run test`
Expected: FAIL.

**Step 3: Write minimal implementation**
Render `handoff.md` and `resume_prompt.md` from capsule JSON.

**Step 4: Run test to verify it passes**
Run: `bun run test`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat: add handoff and resume prompt generators"`

### Task 6: End-to-End Pipeline + Docs

**Files:**
- Create: `src/commands/pipeline.ts`
- Modify: `README.md`
- Create: `examples/sample.raw.ndjson`
- Create: `examples/sample.context_capsule.json`
- Test: `tests/pipeline.smoke.test.ts`

**Step 1: Write the failing test**
Add smoke test for `pipeline` command with fixture input.

**Step 2: Run test to verify it fails**
Run: `bun run test`
Expected: FAIL.

**Step 3: Write minimal implementation**
Wire sequential stage execution and document full workflow.

**Step 4: Run test to verify it passes**
Run: `bun run test`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat: add pipeline command and usage docs"`
