# AI Studio Session Compact Design

**Date:** 2026-03-05

## Goal
Build a CLI tool that exports very long Google AI Studio chat sessions from an already logged-in Chrome tab (via CDP), enriches images with OCR/visual summaries, compresses content into a structured context capsule, and generates a restart prompt for a new session.

## Non-Goals (V1)
- Browser extension packaging
- Automatic account login
- Perfect DOM compatibility for all future AI Studio UI changes

## Architecture
The tool is a Bun + TypeScript CLI with four pipeline stages:
1. `capture`: connect to existing Chrome over CDP and extract turns + images
2. `enrich-images`: run multimodal/OCR summaries on captured images
3. `compress`: perform local heuristic chunk summaries and produce structured JSON capsule
4. `handoff`: produce copy-paste markdown prompt(s) for new session continuation

## Data Contracts
- `session.raw.ndjson`: normalized turn records with role, text, metadata, image refs
- `images.enriched.jsonl`: per-image OCR + semantic summary + confidence
- `context_capsule.json`: compact structured memory for session continuation
- `handoff.md`: concise human-readable briefing for new chat
- `resume_prompt.md`: ready-to-paste prompt with rules and capsule embedding guidance

## Capture Strategy
- Connect to an existing browser with `chromium.connectOverCDP()`
- Locate target tab by URL match (`aistudio.google.com/prompts/`)
- Auto-scroll until text length stabilizes to load older turns
- Extract turn-like nodes using robust selector set + fallback plain-text capture
- Extract image URLs and attempt file materialization by element screenshot

## Image Strategy
- Keep image linkage even when OCR fails
- For each image file, call Doubao multimodal model for:
  - OCR text
  - visual summary
  - inferred relevance to nearby turn text
- Save both structured fields and raw model output snippets for auditing

## Compression Strategy
- Chunk by approximate token budget
- Per chunk: summarize decisions, facts, open questions, TODOs, constraints with local heuristics
- Global pass: merge chunk summaries into stable schema
- Preserve traceability with source turn IDs per extracted fact/decision

## Agent/Docs Workflow
- Prefer local skills for task-scoped workflows.
- Use Context7 for doc-sensitive API behavior (Playwright CDP, Bun runtime flags, OCR options).
- Keep `README.md`, `docs/plans/*`, and `AGENT.md` in sync after architecture changes.

## Failure Handling
- Capture stage writes partial output progressively
- Enrichment stage skips failed images and records errors per item
- Compression stage supports resumable chunk processing
- All stages produce machine-readable run report

## Testing
- Unit tests for chunking and capsule merge logic
- Fixture-based test for NDJSON parsing and handoff rendering
- Smoke test command using sample fixture data

## Security
- No credentials stored by default
- Optional API key via environment variable (`DOUBAO_API_KEY`)
- Local artifacts only; no implicit upload besides model API calls user configured
