# Capture Virtualized Tail Fix Design

## Problem

`capture` is not reliably exporting the newest turns from long AI Studio sessions. The current flow does a preload pass, then extracts from a single DOM snapshot. For AI Studio's virtualized list, that is brittle: whichever region is rendered at extraction time dominates the result. A later recheck also showed that off-screen `ms-chat-turn` elements can stay in DOM while their text content dehydrates, so a coarse sweep can still preserve the wrong tail ordering. The same visible-only assumption also weakens image capture, because element screenshots only work while the relevant image is actually rendered.

## Evidence

- The successful capture in `/root/aistudio-session-compact/out-capture-recheck5-1772780026` ended around 2026-03-06 15:05 local time and stopped at order `673`.
- A later raw artifact in `/root/aistudio-session-compact/out-compact-recheck-1772781038/session.raw.ndjson` contains `order 677` and `order 679`, proving the tail is capturable but not stably captured by the current strategy.
- `src/commands/capture.ts` currently calls `autoScrollLoad()`, which repeatedly forces the scroller to the top, and then `extractTurnsFromChatTurns()`, which scans only the currently rendered `ms-chat-turn` nodes.
- `images.enriched.jsonl` shows OCR did not run on meaningful images because capture did not persist usable local image files; `saveVisibleImages()` only screenshots currently visible `img` elements and silently ignores failures.
- Playwright documentation confirms that `connectOverCDP` is lower fidelity than the normal Playwright protocol, and that locator screenshots only capture visible content. That matches the observed brittleness.
- On April 7, 2026, a transcript re-export initially appeared to stop around `2:55 AM` even though the same session still contained daytime turns. After switching to DOM-order hydration, the corrected tail reached `2:42 PM`, confirming that ordering and hydration state, not raw availability, was the failure mode.

## Requirements

1. Preserve the newest visible turns at the bottom of the session before historical scanning perturbs the DOM.
2. Rehydrate the virtualized list across scroll positions instead of trusting a single DOM snapshot.
3. Deduplicate turns across scroll positions and keep the best text version per turn.
4. Harvest visible images while the corresponding turn is in view, not only after final extraction.
5. Keep the existing CLI and output format stable.
6. Add tests for the new planning logic so regressions are caught without a browser.

## Options Considered

### Option 1: Minimal patch
Add a final scroll-to-bottom pass and re-run the existing extractor.

- Pros: small change
- Cons: still relies on one DOM snapshot, still weak for images, likely unstable

### Option 2: Bottom-first + DOM-order hydration
Capture recent visible turns first, then walk the rendered `ms-chat-turn` list in stable DOM order, scrolling each target row into view and hydrating a small local window around it. Merge those observations by stable turn identity.

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

2. **DOM-order hydration pass**
   - Walk the rendered `ms-chat-turn` collection by stable DOM index.
   - Scroll each target turn into view and harvest a small hydration window around it.
   - Merge all observations into a single turn/image map.

### Turn harvesting model

- Introduce a reusable page-side collector that reads the currently rendered `ms-chat-turn` nodes.
- Deduplicate observations by DOM turn id when available, otherwise by a fallback key derived from stable DOM order.
- When the same turn is seen multiple times, keep the longest normalized text.

### Image harvesting model

- While a turn is visible during a hydration step, inspect descendant `img` nodes.
- Attempt screenshots immediately for needed sources and remember successful saves by source.
- Continue to attach saved images to turns after the full pass.

### Scroll planning

- Add pure helpers that keep the capture loop deterministic:
  - a stable observation key based on DOM id or DOM order fallback,
  - a clamped hydration window around each target turn,
  - image/save bookkeeping helpers for repeated hydration steps.
- Unit-test those helpers directly so regressions are caught without a live browser.

## Testing Strategy

- Add unit tests for stable fallback keys and hydration window generation.
- Add unit tests for merging observed turn snapshots so longer text wins and duplicate keys collapse.
- Keep existing extraction normalization tests.
- In live capture checks, verify the actual transcript tail ordering and timestamps, not only the aggregate turn count.
- Run `bun test`, `bun run lint`, and `bun run build`.

## Non-goals

- No change to `compress`.
- No attempt to reverse engineer AI Studio network APIs.
- No UI redesign or CLI redesign.
