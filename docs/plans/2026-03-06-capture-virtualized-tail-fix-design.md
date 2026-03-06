# Capture Virtualized Tail Fix Design

## Problem

`capture` is not reliably exporting the newest turns from long AI Studio sessions. The current flow does a preload pass, then extracts from a single DOM snapshot. For AI Studio's virtualized list, that is brittle: whichever region is rendered at extraction time dominates the result. The same visible-only assumption also weakens image capture, because element screenshots only work while the relevant image is actually rendered.

## Evidence

- The successful capture in `/root/aistudio-session-compact/out-capture-recheck5-1772780026` ended around 2026-03-06 15:05 local time and stopped at order `673`.
- A later raw artifact in `/root/aistudio-session-compact/out-compact-recheck-1772781038/session.raw.ndjson` contains `order 677` and `order 679`, proving the tail is capturable but not stably captured by the current strategy.
- `src/commands/capture.ts` currently calls `autoScrollLoad()`, which repeatedly forces the scroller to the top, and then `extractTurnsFromChatTurns()`, which scans only the currently rendered `ms-chat-turn` nodes.
- `images.enriched.jsonl` shows OCR did not run on meaningful images because capture did not persist usable local image files; `saveVisibleImages()` only screenshots currently visible `img` elements and silently ignores failures.
- Playwright documentation confirms that `connectOverCDP` is lower fidelity than the normal Playwright protocol, and that locator screenshots only capture visible content. That matches the observed brittleness.

## Requirements

1. Preserve the newest visible turns at the bottom of the session before historical scanning perturbs the DOM.
2. Sweep the virtualized list across scroll positions instead of trusting a single DOM snapshot.
3. Deduplicate turns across scroll positions and keep the best text version per turn.
4. Harvest visible images while the corresponding turn is in view, not only after final extraction.
5. Keep the existing CLI and output format stable.
6. Add tests for the new planning logic so regressions are caught without a browser.

## Options Considered

### Option 1: Minimal patch
Add a final scroll-to-bottom pass and re-run the existing extractor.

- Pros: small change
- Cons: still relies on one DOM snapshot, still weak for images, likely unstable

### Option 2: Bottom-first + historical sweep
Capture recent visible turns first, then sweep through scroll positions to collect historical turns and images, deduping by stable turn identity.

- Pros: directly addresses virtualized DOM behavior, keeps current architecture, also improves image capture
- Cons: more moving parts than option 1

### Option 3: Network/storage reverse engineering
Stop relying on DOM and decode the underlying AI Studio data source.

- Pros: highest theoretical ceiling
- Cons: highest risk and maintenance burden, out of scope for this bugfix

## Chosen Approach

Option 2.

## Design

### Two-phase capture

1. **Recent pass**
   - Do not destroy the bottom state immediately.
   - Explicitly scroll to the bottom and harvest the currently rendered turns and images.
   - This pass is optimized for the freshest messages.

2. **Historical sweep**
   - Scroll upward through the virtualized container in overlapping windows.
   - At each scroll position, harvest the rendered turns and visible images.
   - Merge all observations into a single turn/image map.

### Turn harvesting model

- Introduce a reusable page-side collector that reads the currently rendered `ms-chat-turn` nodes.
- Deduplicate observations by DOM turn id when available, otherwise by a fallback key derived from text and relative position.
- When the same turn is seen multiple times, keep the longest normalized text.

### Image harvesting model

- While a turn is visible during a sweep step, inspect descendant `img` nodes.
- Attempt screenshots immediately for needed sources and remember successful saves by source.
- Continue to attach saved images to turns after the full sweep.

### Scroll planning

- Add a pure helper that computes sweep positions from scroll metrics.
- The plan must always include the bottom-most position first, then walk upward with overlap, then optionally include top.
- This helper will be unit-tested directly.

## Testing Strategy

- Add unit tests for scroll plan generation.
- Add unit tests for merging observed turn snapshots so longer text wins and duplicate keys collapse.
- Keep existing extraction normalization tests.
- Run `bun test`, `bun run lint`, and `bun run build`.

## Non-goals

- No change to `compress`.
- No attempt to reverse engineer AI Studio network APIs.
- No UI redesign or CLI redesign.
