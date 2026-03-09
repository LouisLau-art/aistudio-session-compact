# aistudio-session-compact

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Bun >=1.3](https://img.shields.io/badge/bun-%3E%3D1.3-f9f1e1)
![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Status: Active](https://img.shields.io/badge/status-active-success)
![Last Commit](https://img.shields.io/github/last-commit/LouisLau-art/aistudio-session-compact)
![Visibility](https://img.shields.io/badge/visibility-public-brightgreen)

CLI tool for exporting very long Google AI Studio sessions, with transcript-first continuation and optional compaction fallback.

## Features

- Capture AI Studio session content from an already logged-in Chrome tab via CDP
- Render `transcript.txt` and `transcript.md` as the primary continuation artifacts
- Extract message text and image references
- Enrich images with OCR-first strategy (`tesseract`) + optional multimodal summaries (`doubao`)
- Optionally compact long sessions into a `context_capsule.json`
- Generate `handoff.md` and `resume_prompt.md` as secondary/fallback continuation artifacts

## Prerequisites

- Bun 1.3+
- Node.js 20+ (optional compatibility path)
- Chrome/Chromium running with remote debugging port enabled
- Optional: `DOUBAO_API_KEY` for multimodal enrichment (preferred in `auto` mode)
- Local OCR: `tesseract` with language packs (`eng`, `chi_sim`)

## Install

```bash
bun install
```

Install OCR backends:

```bash
# Tesseract (already supported)
sudo pacman -S --needed tesseract tesseract-data-eng tesseract-data-chi_sim

# Optional PaddleOCR sidecar (CPU)
# Note: Paddle runtime typically supports Python 3.10~3.12.
# If your system Python is newer (e.g. 3.14), use a separate compatible interpreter.
python -m venv .venv-ocr
source .venv-ocr/bin/activate
python -m pip install paddlepaddle -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
python -m pip install paddleocr
```

## Run Browser with CDP

Recommended (auto-detect Chromium/Canary/Chrome; Chromium preferred):

```bash
bun run cdp:start
```

Force Chromium:

```bash
bash scripts/start-cdp-browser.sh chromium 9222
```

Force Canary (only if you explicitly need Canary):

```bash
bash scripts/start-cdp-browser.sh canary 9222
```

Start CDP and open a specific AI Studio session URL immediately:

```bash
bash scripts/start-cdp-browser.sh chromium 9222 "https://aistudio.google.com/prompts/1dZg0Xc4y74lOcj-TFbk84WlJTEZkhCSx"
```

Headless mode (for servers/CI):

```bash
CDP_HEADLESS=1 bash scripts/start-cdp-browser.sh chromium 9222
```

If CDP still cannot connect and logs show `Opening in existing browser session`, close all windows/processes of that browser and re-run. This is required when the browser was already started without `--remote-debugging-port`.

## Headless Transcript Workflow (Recommended)

Run transcript-first export in CLI with headless Chromium:

```bash
bun run transcript:headless -- "https://aistudio.google.com/prompts/<session-id>"
```

Behavior:

- Uses Chromium profile `~/.config/chromium` by default
- Starts CDP in headless mode automatically
- Matches target tab by session URL (`aistudio.google.com/prompts/<id>`) by default
- Runs capture + transcript export end-to-end by default
- Image enrichment is optional; enable it only when you need OCR or image context
- If login is expired, fails fast with explicit "Google sign-in required" message
- Capture quality gate is enabled by default (fails fast on noisy/invalid extraction)

If multiple tabs still cause mismatch, set explicit tab index:

```bash
TAB_INDEX=0 bun run transcript:headless -- "https://aistudio.google.com/prompts/<session-id>"
```

One-time login refresh when session expires:

```bash
CDP_USER_DATA_DIR="$HOME/.config/chromium" bash scripts/start-cdp-browser.sh chromium 9222 "https://aistudio.google.com/prompts/<session-id>"
# complete login in browser window once, then rerun:
bun run transcript:headless -- "https://aistudio.google.com/prompts/<session-id>"
```

## Usage

```bash
bun run dev -- capture --out ./out
bun run dev -- transcript --raw ./out/session.raw.ndjson --out-dir ./out
```

Optional image-aware transcript export:

```bash
bun run dev -- enrich-images --raw ./out/session.raw.ndjson --out ./out/images.enriched.jsonl --provider auto --ocr-engine auto --ocr-lang eng+chi_sim
bun run dev -- transcript --raw ./out/session.raw.ndjson --images ./out/images.enriched.jsonl --out-dir ./out
```

One-shot transcript export without image enrichment:

```bash
bun run dev -- export-transcript --out ./out
```

One-shot transcript export with OCR/image enrichment:

```bash
bun run dev -- export-transcript --out ./out --with-images --provider auto --ocr-engine auto --ocr-lang eng+chi_sim
```

Headless one-shot transcript export:

```bash
bun run transcript:headless -- "https://aistudio.google.com/prompts/<session-id>"
```

Headless transcript export with OCR/image enrichment:

```bash
WITH_IMAGES=1 bun run transcript:headless -- "https://aistudio.google.com/prompts/<session-id>"
```

Optional compaction fallback when the raw transcript is still too large:

```bash
bun run dev -- compress --raw ./out/session.raw.ndjson --images ./out/images.enriched.jsonl --out ./out/context_capsule.json
bun run dev -- handoff --capsule ./out/context_capsule.json --out-dir ./out
```

Legacy full pipeline:

```bash
bun run dev -- pipeline --out ./out --provider auto --ocr-engine auto --ocr-lang eng+chi_sim
```

Disable strict capture gate for raw debugging only:

```bash
bun run dev -- pipeline --out ./out --provider none --no-strict-capture
```

Limit image screenshots to speed up very large sessions:

```bash
bun run dev -- capture --out ./out --max-image-screenshots 40
# headless wrapper:
MAX_IMAGE_SCREENSHOTS=40 bun run transcript:headless -- "https://aistudio.google.com/prompts/<session-id>"
```

If URL matching fails (for example due login redirect), select a tab directly:

```bash
bun run dev -- pipeline --out ./out --tab-index 0 --provider none
```

Headless wrapper can also disable strict gate:

```bash
STRICT_CAPTURE=0 bun run transcript:headless -- "https://aistudio.google.com/prompts/<session-id>"
```

Force OCR-only mode (no multimodal API key):

```bash
bun run dev -- enrich-images --raw ./out/session.raw.ndjson --provider none
```

Use Doubao vision explicitly:

```bash
export DOUBAO_API_KEY="your_doubao_key"
export VISION_MODEL="your_doubao_vision_model_id"
bun run dev -- enrich-images --raw ./out/session.raw.ndjson --provider doubao
```

Force PaddleOCR engine:

```bash
bun run dev -- enrich-images --raw ./out/session.raw.ndjson --ocr-engine paddle --python-bin python3
```

If Paddle is unavailable, engine auto-detect falls back to Tesseract.

## Outputs

- `session.raw.ndjson`
- `transcript.txt`
- `transcript.md`
- `transcript.report.json`
- `images.enriched.jsonl` (only when image enrichment is enabled)
- `context_capsule.json`
- `handoff.md`
- `resume_prompt.md`
- `run-report.json`

## Notes

- AI Studio DOM can evolve; extractor is selector-heuristic with fallback.
- Image extraction is best effort; failures are recorded, not fatal.
- Transcript export is the default continuation path; compaction is the fallback path.
- OCR engine supports `auto|tesseract|paddle`; `paddle` failure auto-falls back to `tesseract`.
- For very large chats, prefer OCR-first + selective multimodal enhancement for cost control.
