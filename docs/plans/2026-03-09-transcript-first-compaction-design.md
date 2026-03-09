# Transcript-First Session Export Design

**Date:** 2026-03-09

## Goal
Make transcript export the primary workflow for AI Studio session continuation, and treat compaction as a manual fallback for sessions that still do not fit after raw text export.

## Problem
The current product posture is too compression-centric. That made sense while we were trying to recover usable continuation artifacts from noisy capture data, but it is not the user's actual primary need.

The real need is:
- export a very long AI Studio session reliably,
- preserve as much original wording as possible,
- move that history into a new AI Studio session when the old one reaches its 1M-token limit,
- only compact when the exported raw transcript is still too large.

This matters especially for the target use case: long-running, emotionally loaded, high-context conversations about a complicated relationship story, recurring people, and interpretive frameworks. In that setting, aggressive summarization is risky because it can erase chronology, flatten character dynamics, or misstate the user's live question.

A concrete observation from real use changed the priority: a session that occupied roughly 900k tokens inside AI Studio exported to plain text and only consumed roughly 300k+ tokens when pasted into a new session. That strongly suggests the default product path should be transcript-first, not summary-first.

## Design Principles
- Prefer full transcript over summary whenever it fits.
- Keep compaction manual; do not introduce auto-compaction now.
- Preserve the current `compress`/`handoff` path as a secondary capability, not the default answer.
- Separate long-lived story background from rolling session state.
- Keep the system local-first and provider-optional.
- Avoid borrowing coding-agent behavior that only exists to keep autonomous turns alive.

## What We Borrow From Coding Agents
Research on `codex`, `gemini-cli`, and `opencode` is still useful, but only selectively.

Useful ideas:
- Preserve a recent raw tail instead of summarizing everything.
- Replace old history with a deterministic recovery artifact, not just a pretty markdown note.
- Separate pruning of low-value bulky content from semantic state extraction.

Not useful right now:
- automatic per-turn compaction,
- mid-turn rescue behavior,
- overflow-driven self-preservation logic,
- coding-agent assumptions about tool output and code diffs as the primary context.

For this product, the user explicitly intends to let a session fill up, then migrate to a new session manually. That makes manual, end-of-session compaction the right target.

## Recommended Approach
Adopt a two-tier workflow.

### Tier 1: Default Workflow (`transcript-first`)
1. `capture` the full session into `session.raw.ndjson`.
2. Optionally `enrich-images` if there are real images worth OCRing.
3. Render:
   - `transcript.txt`
   - `transcript.md`
4. Paste the exported transcript into a fresh AI Studio session.

This is the default, recommended path.

### Tier 2: Manual Fallback (`compaction`)
Only if the transcript still does not fit comfortably:
1. Start from the captured raw session plus optional image enrichment.
2. Inject a stable background file (`story_briefing.json`).
3. Build manual compaction artifacts:
   - `state_snapshot.json`
   - `preserved_tail.ndjson`
   - `replacement_history.json`
4. Derive human-readable handoff artifacts from those machine-readable sources.

This is the fallback path, not the default path.

## Alternatives Considered
### 1. Keep current compression-first posture
- Pros: minimum product change.
- Cons: continues to optimize the wrong default path; summary artifacts remain the first thing users see even when raw transcript is good enough.
- Rejected.

### 2. Immediately rewrite everything around compaction-only artifacts
- Pros: cleaner long-term architecture.
- Cons: over-rotates toward a secondary workflow and delays a simpler, more valuable transcript export path.
- Rejected for now.

### 3. Make transcript export primary and keep compaction as manual fallback
- Pros: aligned with real usage, lowest semantic loss, fastest path to value, still leaves room for stronger compaction later.
- Cons: requires CLI/product restructuring and a clearer split between transcript export and compaction.
- Chosen.

## Product Workflow
Recommended user journey becomes:

1. Run a transcript-oriented export on a nearly full AI Studio session.
2. Inspect `transcript.txt` first.
3. If it fits, use it directly in a new session.
4. If it is still too large, run manual compaction.
5. Use compaction artifacts only when transcript export is no longer enough.

This changes the role of compaction from “default engine” to “budget fallback”.

## Artifact Model
### Primary artifacts
- `session.raw.ndjson`: canonical captured turns.
- `images.enriched.jsonl`: optional OCR/vision results.
- `transcript.txt`: canonical migration artifact for new AI Studio sessions.
- `transcript.md`: readable version for inspection.
- `transcript.report.json`: export metadata.

### Secondary artifacts
- `context_capsule.json`
- `handoff.md`
- `resume_prompt.md`

These remain supported but become secondary.

### Future manual-compaction artifacts
- `story_briefing.json`: stable story background, people map, frameworks.
- `state_snapshot.json`: current session state.
- `preserved_tail.ndjson`: recent raw turns kept verbatim.
- `replacement_history.json`: deterministic context-recovery payload.

## CLI Direction
Recommended CLI structure:
- Add a dedicated `transcript` command that renders `transcript.txt` and `transcript.md` from raw capture output.
- Add a transcript-oriented wrapper command or script for the common path: capture -> optional OCR -> transcript export.
- Keep existing `compress` and `handoff` commands intact.
- Keep current `pipeline` available for backwards compatibility, but stop presenting it as the default workflow in docs.

This gives the project a stable primary path without breaking existing secondary tooling.

## Data Model Direction
### Transcript path
No semantic rewriting is required. The exporter should:
- preserve turn order,
- preserve role labels,
- preserve raw wording,
- append OCR snippets only when real image enrichment exists,
- avoid introducing synthetic summary text into the main transcript body.

### Future compaction path
Compaction should stop treating one capsule as the single source of truth. Instead it should separate:
- stable background,
- rolling current state,
- preserved recent raw context,
- machine-readable replacement history.

## Testing Strategy
### Transcript-first work
- Add render tests for `transcript.txt` and `transcript.md`.
- Add flow tests for transcript export from `session.raw.ndjson`.
- Verify transcript output preserves order, roles, and raw wording.
- Verify OCR snippets appear only when real enrichment exists.

### Compatibility work
- Keep current `compress` and `handoff` tests green.
- Add CLI/flow coverage proving transcript export can coexist with current commands.

### Future manual compaction work
- Defer to a follow-up plan after transcript-first export is shipped.

## Non-Goals
- Auto-compaction during live chatting.
- Recreating coding-agent overflow management behavior.
- Perfect multimodal fidelity in this task.
- Replacing the current compaction stack in the same change as transcript-first export.
