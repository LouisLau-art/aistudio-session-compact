# aistudio-session-compact

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Status: Active](https://img.shields.io/badge/status-active-success)
![Last Commit](https://img.shields.io/github/last-commit/LouisLau-art/aistudio-session-compact)
![Visibility](https://img.shields.io/badge/visibility-public-brightgreen)

CLI tool for exporting very long Google AI Studio sessions and creating compact continuation artifacts.

## Features

- Capture AI Studio session content from an already logged-in Chrome tab via CDP
- Extract message text and image references
- Enrich images with OCR-first strategy (`tesseract`) + optional multimodal summaries (`doubao`/`gemini`)
- Hierarchically compress long sessions into a `context_capsule.json`
- Generate `handoff.md` and `resume_prompt.md` for seamless continuation

## Prerequisites

- Node.js 20+
- Chrome/Chromium running with remote debugging port enabled
- Optional: `GEMINI_API_KEY` for multimodal enrichment and model-based compression
- Optional: `DOUBAO_API_KEY` for multimodal enrichment (preferred in `auto` mode)
- Local OCR: `tesseract` with language packs (`eng`, `chi_sim`)

## Install

```bash
npm install
```

Install OCR backends:

```bash
# Tesseract (already supported)
sudo pacman -S --needed tesseract tesseract-data-eng tesseract-data-chi_sim

# Optional PaddleOCR sidecar (CPU)
python -m venv .venv-ocr
source .venv-ocr/bin/activate
python -m pip install paddlepaddle==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
python -m pip install paddleocr
```

## Run Chrome with CDP

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-cdp
```

If you need your existing profile/session, launch with your normal profile path and ensure security hygiene.

## Usage

```bash
npm run dev -- capture --out ./out
npm run dev -- enrich-images --raw ./out/session.raw.ndjson --out ./out/images.enriched.jsonl --provider auto --ocr-engine auto --ocr-lang eng+chi_sim
npm run dev -- compress --raw ./out/session.raw.ndjson --images ./out/images.enriched.jsonl --out ./out/context_capsule.json
npm run dev -- handoff --capsule ./out/context_capsule.json --out-dir ./out
```

One-shot pipeline:

```bash
npm run dev -- pipeline --out ./out --provider auto --ocr-engine auto --ocr-lang eng+chi_sim
```

Force OCR-only mode (no multimodal API key):

```bash
npm run dev -- enrich-images --raw ./out/session.raw.ndjson --provider none
```

Use Doubao vision explicitly:

```bash
export DOUBAO_API_KEY="your_doubao_key"
export VISION_MODEL="your_doubao_vision_model_id"
npm run dev -- enrich-images --raw ./out/session.raw.ndjson --provider doubao
```

Force PaddleOCR engine:

```bash
npm run dev -- enrich-images --raw ./out/session.raw.ndjson --ocr-engine paddle --python-bin python3
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
- OCR engine supports `auto|tesseract|paddle`; `paddle` failure auto-falls back to `tesseract`.
- For very large chats, prefer OCR-first + selective multimodal enhancement for cost control.
