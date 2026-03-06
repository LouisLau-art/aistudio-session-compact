# Handoff Restructure Design

**Date:** 2026-03-06

## Goal
Restructure `compress` and `handoff` output so a new model session can immediately understand the current state of a long AI Studio conversation, instead of receiving a mixed archive of historical fragments.

## Problem
The current `resume_prompt.md` is structurally valid but semantically weak. It mixes old and new goals, promotes quoted historical snippets into active questions, and overweights global sampling instead of the latest conversation state. The result is a document that is debuggable but not trustworthy as a real handoff.

## Design Principles
- Prioritize current state over global archival coverage.
- Separate active context from historical context.
- Keep heuristic compression as the baseline implementation.
- Preserve compatibility with the existing capture/raw/image pipeline.
- Avoid requiring paid APIs or online summarization.

## Recommended Approach
Add a new handoff-oriented layer on top of the current capsule builder:
1. Compute `currentState` from the most recent chunk window.
2. Compute `stableDecisions` from repeated or recent-high-confidence decisions.
3. Compute `recentTimeline` from only the latest chunk window, not evenly sampled history.
4. Move older/high-noise material into an explicit appendix section.
5. Render `resume_prompt.md` around those sections instead of exposing the old global category dump as the primary narrative.

## Alternatives Considered
### 1. Keep current capsule schema and only tweak regexes
- Pros: small patch, low risk.
- Cons: does not solve the architectural problem of mixing current state with archive.
- Rejected because the latest output is still not trustworthy for continuation.

### 2. Replace heuristic compression with an LLM summarizer immediately
- Pros: potentially better summaries.
- Cons: adds provider, cost, nondeterminism, and evaluation complexity.
- Rejected for now because the product still needs a strong local baseline.

### 3. Add a current-state layer while preserving heuristic baseline
- Pros: best risk/reward, keeps local-first design, improves handoff quality materially.
- Cons: requires schema + renderer changes and new tests.
- Chosen.

## Data Model Changes
Add handoff-oriented fields to `ContextCapsule`:
- `currentState`: summary of current objective, stance, active unresolved items, immediate next continuation points.
- `stableDecisions`: promoted subset of durable decisions.
- `recentTimeline`: latest checkpoint-focused timeline.
- `appendix`: archived historical goals/questions/facts kept separate from the main handoff.

Existing fields may remain for compatibility, but the renderer should stop treating them as the primary handoff narrative.

## Rendering Changes
`resume_prompt.md` should become:
1. Current State
2. Stable Decisions
3. Active Constraints
4. Active Open Questions
5. Recent Timeline
6. Appendix (historical context, clearly marked as secondary)

`handoff.md` should mirror the same structure in a more human-readable form.

## Heuristic Strategy Changes
- Split chunk aggregation into `recent window` and `archive window`.
- Build primary handoff sections from recent chunks only.
- Promote a small number of durable decisions/constraints from the full conversation when repeated or reinforced recently.
- Keep appendix intentionally small and clearly secondary.

## Testing Strategy
- Add failing tests for current-state prioritization.
- Add failing tests for appendix separation.
- Add render tests asserting the new section order and absence of archive-first structure.
- Re-run a real captured session and inspect resulting `resume_prompt.md` manually.

## Non-Goals
- Perfect semantic understanding of every relationship detail in the conversation.
- Replacing heuristic compression with a paid/provider-dependent summarizer.
- Reworking capture or OCR in this task.
