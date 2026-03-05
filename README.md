# aistudio-session-compact

CLI tool for exporting very long Google AI Studio sessions and creating compact continuation artifacts.

## Features

- Capture AI Studio session content from an already logged-in Chrome tab via CDP
- Extract message text and image references
- Enrich images with OCR + visual summaries (Gemini multimodal)
- Hierarchically compress long sessions into a `context_capsule.json`
- Generate `handoff.md` and `resume_prompt.md` for seamless continuation

## Prerequisites

- Node.js 20+
- Chrome/Chromium running with remote debugging port enabled
- Optional: `GEMINI_API_KEY` for multimodal enrichment and model-based compression

## Install

```bash
npm install
```

## Run Chrome with CDP

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-cdp
```

If you need your existing profile/session, launch with your normal profile path and ensure security hygiene.

## Usage

```bash
npm run dev -- capture --out ./out
npm run dev -- enrich-images --raw ./out/session.raw.ndjson --out ./out/images.enriched.jsonl
npm run dev -- compress --raw ./out/session.raw.ndjson --images ./out/images.enriched.jsonl --out ./out/context_capsule.json
npm run dev -- handoff --capsule ./out/context_capsule.json --out-dir ./out
```

One-shot pipeline:

```bash
npm run dev -- pipeline --out ./out
```

## Outputs

- `session.raw.ndjson`
- `images.enriched.jsonl`
- `context_capsule.json`
- `handoff.md`
- `resume_prompt.md`
- `run-report.json`

## Notes

- AI Studio DOM can evolve; extractor is selector-heuristic with fallback.
- Image extraction is best effort; failures are recorded, not fatal.
- For very large chats, prefer model-assisted compression with chunking.
