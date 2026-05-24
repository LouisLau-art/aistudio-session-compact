# aistudio-session-compact

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Bun >=1.3](https://img.shields.io/badge/bun-%3E%3D1.3-f9f1e1)
![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Status: Active](https://img.shields.io/badge/status-active-success)
![Last Commit](https://img.shields.io/github/last-commit/LouisLau-art/aistudio-session-compact)
![Visibility](https://img.shields.io/badge/visibility-public-brightgreen)

Export long Google AI Studio sessions, turn them into reliable transcripts, and optionally index them into a local RAG memory.

## What This Does

This repository is a local CLI toolkit. It is not limited to one agent client and does not require MCP to be useful.

The workflow has three layers:

1. **Transcript export**: connect to an already logged-in Chrome tab through CDP, hydrate long AI Studio virtualized chat turns, and write `transcript.txt`, `transcript.md`, and `session.raw.ndjson`.
2. **Optional compaction**: turn a very large raw session into `state_snapshot.json`, `preserved_tail.ndjson`, `handoff.md`, and `resume_prompt.md`.
3. **Optional memory indexing**: send exported sessions through the Python `memory-system/` sidecar, build embeddings, store chunks in ChromaDB, and query them later with vector search plus optional reranking.

Default behavior should be transcript-first. Do not run OCR, compaction, handoff, or memory rebuild unless the task needs it.

## Requirements

- Bun 1.3+
- Node.js 20+
- Chrome or Chromium with remote debugging enabled
- A logged-in Google AI Studio browser session
- Python 3.13+ in `~/.venv/ml` for the memory sidecar
- Optional OCR: `tesseract`

Install JavaScript dependencies:

```bash
bun install
```

Optional OCR packages on Ubuntu:

```bash
sudo nala install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim
```

## Quickstart: Export Text

For supported URLs, the simplest path is the auto-router:

```bash
URL="https://chatgpt.com/c/<conversation-id>"
CDP_PROXY_SERVER="http://127.0.0.1:7897" bash scripts/start-cdp-browser.sh chrome 9222 "$URL"

bun run dev -- export-url "$URL"
```

`export-url` detects AI Studio, ChatGPT, and Gemini URLs, then writes to `out/<provider>-<id>-<date>` unless `--out` is provided.

To let the repo start/reuse the browser, wait for login, and export in one command:

```bash
URL="https://chatgpt.com/c/<conversation-id>"
CDP_PROXY_SERVER="http://127.0.0.1:7897" bun run export:url -- "$URL"
```

If the browser lands on a login page, finish login in that window. The script waits until the target conversation tab is available, then calls `export-url`.

### AI Studio Direct Command

Set the prompt id and start a CDP browser on that AI Studio session:

```bash
PROMPT_ID="<prompt-id>"
bash scripts/start-cdp-browser.sh chromium 9222 "https://aistudio.google.com/prompts/${PROMPT_ID}"
```

Complete Google login in that browser if needed, then run the text export:

```bash
OUT="out/${PROMPT_ID}-$(date +%Y%m%d)"

bun run dev -- export-transcript \
  --cdp-url http://127.0.0.1:9222 \
  --url-match "aistudio.google.com/prompts/${PROMPT_ID}" \
  --out "$OUT" \
  --provider none \
  --max-image-screenshots 0

wc -lc "$OUT/transcript.txt"
tail -n 80 "$OUT/transcript.txt"
```

Success means:

- `transcript.txt` and `transcript.md` exist
- `session.raw.ndjson` exists
- the transcript tail contains the latest expected conversation turns
- `export-transcript.report.json` reports the expected `turnCount`

For long sessions, tail content matters more than `turnCount` alone.

## Quickstart: Export ChatGPT Directly

Open the target conversation in a CDP browser that is already logged in to ChatGPT:

```bash
CHATGPT_URL="https://chatgpt.com/c/<conversation-id>"
CDP_PROXY_SERVER="http://127.0.0.1:7897" \
  bash scripts/start-cdp-browser.sh chrome 9222 "$CHATGPT_URL"
```

`CDP_PROXY_SERVER` is optional. Use it only when Chrome needs the same local proxy that your shell uses.

Then export the conversation:

```bash
OUT="out/chatgpt-<conversation-id>-$(date +%Y%m%d)"

bun run dev -- export-chatgpt \
  --conversation-url "$CHATGPT_URL" \
  --out "$OUT"

wc -lc "$OUT/transcript.txt"
tail -n 80 "$OUT/transcript.txt"
```

The command writes `session.raw.ndjson`, `transcript.txt`, `transcript.md`, `transcript.report.json`, and `export-chatgpt.report.json`. It reads ChatGPT's backend conversation JSON from the logged-in page context; it does not scrape visible DOM text.

## Quickstart: Export Gemini Directly

Open the target Gemini conversation in a logged-in CDP browser:

```bash
GEMINI_URL="https://gemini.google.com/app/<conversation-id>"
CDP_PROXY_SERVER="http://127.0.0.1:7897" \
  bash scripts/start-cdp-browser.sh chrome 9222 "$GEMINI_URL"
```

Then export the visible conversation turns:

```bash
OUT="out/gemini-<conversation-id>-$(date +%Y%m%d)"

bun run dev -- export-gemini \
  --conversation-url "$GEMINI_URL" \
  --out "$OUT"

wc -lc "$OUT/transcript.txt"
tail -n 80 "$OUT/transcript.txt"
```

Unlike ChatGPT export, Gemini export currently uses DOM extraction from the loaded app/share page. Keep the tab active and make sure older turns are loaded before export if the conversation is long.

## Use From Agent Clients

Any agent that can run shell commands can use this repo.

| Client | Best path |
| --- | --- |
| Claude Code | Read `CLAUDE.md`; use `/aistudio-export-text` for AI Studio URLs and `/memory-workflow` for RAG context. |
| Codex | Read `AGENT.md` and run the CLI commands directly. |
| Gemini CLI | Read `README.md` and `AGENT.md`, then run shell commands from this directory. |
| OpenCode | Run the same CLI commands; project skills can be synced separately if native skill invocation is needed. |

Use this bootstrap prompt for any agent:

```text
Work in this repository. Read README.md and AGENT.md first.
Do not print .env values.
Do not commit out/, memory/, .claude/handoffs/, or memory-system/.claude/handoffs/.
Use transcript-first export for AI Studio URLs unless OCR, compaction, handoff, or memory rebuild is explicitly requested.
Before memory commands, run: set -a; source .env; set +a
```

## Memory And RAG

The `memory:*` TypeScript commands are a thin bridge to the Python CLI in `memory-system/`.

Load local environment variables first:

```bash
set -a; source .env; set +a
```

Check readiness:

```bash
bun run dev -- memory:doctor
```

Expected shape:

```text
Result: READY
SILICONFLOW_API_KEY: SET
DASHSCOPE_API_KEY: SET or MISSING
```

`DASHSCOPE_API_KEY` must be `SET` for reranking. If it is `MISSING`, memory query still works through hybrid exact + vector search without remote reranking.

Key roles:

| Variable | Purpose |
| --- | --- |
| `SILICONFLOW_API_KEY` | Required for BGE-M3 embeddings during build and query. |
| `DASHSCOPE_API_KEY` | Enables DashScope reranking. Without it, retrieval falls back to hybrid exact + vector ranking. |
| `LLM_API_KEY` or `ARK_API_KEY` | Optional persona and timeline extraction during build. |

Query memory:

```bash
bun run dev -- memory:query "How did we handle AI Studio transcript export?"
```

`memory:query` uses hybrid retrieval: exact keyword/date matching is merged with vector search, then DashScope reranking is applied when available. This matters for factual questions like "what happened on April 25" where a noisy semantic query can otherwise retrieve the wrong competition or project.

Check the `retrieval` block in the JSON output:

| Field | Meaning |
| --- | --- |
| `exact_terms` | Date/name/keyword terms extracted for exact matching. |
| `exact_hits` | Number of exact hits from `memory/chunks_meta.json`. |
| `vector_hits` | Number of Chroma vector hits before merge/rerank. |
| `rerank_status` | `ok`, `disabled`, `failed`, or `not_run`. |
| `rerank_error` | Error text when remote reranking fails. |

If `rerank_status` is `failed` or `disabled`, treat the answer as lower confidence unless exact hits clearly support it.

`memory:query` prints matched chunks and may include private conversation text. Use it locally; do not paste raw output into public issues, README examples, or commit messages.

Generate context for another agent:

```bash
bun run dev -- memory:prompt "Continue work on AI Studio export, memory build, and reranking"
```

Add newly exported sessions to memory:

```bash
bun run dev -- memory:doctor --mode build
bun run dev -- memory:build --sessions-only --rebuild
bun run dev -- memory:doctor
```

Use `--sessions-only` when you only want AI Studio sessions indexed. Use `--rebuild` when replacing the local Chroma index with the current exports.

Run retrieval regression checks:

```bash
bun run dev -- memory:eval --cases memory/evals/personal-golden.json
```

Keep real personal eval cases under ignored `memory/evals/`. A public, sanitized example lives at `memory-system/evals/sample-golden-cases.json`.

Eval cases support `query`, `must_include`, `must_include_any`, `must_not_include`, `source_keywords`, and `require_exact_hit`.

For more detail, see [`docs/memory-system-runbook.md`](./docs/memory-system-runbook.md).

## Common Workflows

### Export With OCR Or Images

Only enable image processing when image content matters:

```bash
bun run dev -- export-transcript \
  --out "$OUT" \
  --with-images \
  --provider auto \
  --ocr-engine auto \
  --ocr-lang eng+chi_sim
```

Force OCR-only mode:

```bash
bun run dev -- enrich-images \
  --raw "$OUT/session.raw.ndjson" \
  --provider none
```

### Compact A Session

Use compaction only when raw transcripts are too large for the next agent or model:

```bash
bun run dev -- compress \
  --raw "$OUT/session.raw.ndjson" \
  --out-dir "$OUT/compact"

bun run dev -- handoff \
  --snapshot "$OUT/compact/state_snapshot.json" \
  --tail "$OUT/compact/preserved_tail.ndjson" \
  --out-dir "$OUT/compact"
```

`handoff.md` and `resume_prompt.md` are fallback continuation artifacts. They are not required for a normal text export.

### Start CDP Manually

```bash
bash scripts/start-cdp-browser.sh chromium 9222 "https://aistudio.google.com/prompts/<prompt-id>"
```

Default browser launch without a URL:

```bash
bun run cdp:start
```

Headless mode:

```bash
CDP_HEADLESS=1 bash scripts/start-cdp-browser.sh chromium 9222
```

Optional proxy for the browser:

```bash
CDP_PROXY_SERVER="http://127.0.0.1:7897" bash scripts/start-cdp-browser.sh chrome 9222
```

If the browser opens an existing non-CDP session, close existing browser processes and rerun the command.

### Select A Tab Directly

Use this when URL matching fails or the page redirects during login:

```bash
bun run dev -- export-transcript \
  --tab-index 0 \
  --out "$OUT" \
  --provider none
```

## Command Reference

| Command | Purpose |
| --- | --- |
| `bun run dev -- capture` | Capture turns from the active AI Studio CDP tab into `session.raw.ndjson`. |
| `bun run dev -- transcript` | Render `transcript.txt` and `transcript.md` from a raw session file. |
| `bun run dev -- export-url <url>` | Auto-route an AI Studio, ChatGPT, or Gemini URL to the right exporter. |
| `bun run dev -- export-transcript` | Run capture and transcript export in one command. |
| `bun run dev -- export-chatgpt` | Export a logged-in ChatGPT conversation through CDP backend API access. |
| `bun run dev -- export-gemini` | Export visible Gemini app/share conversation turns through CDP DOM extraction. |
| `bun run dev -- enrich-images` | Run OCR and optional vision enrichment for captured images. |
| `bun run dev -- compress` | Create compact state and preserved tail artifacts. |
| `bun run dev -- handoff` | Generate handoff and resume prompt from compact artifacts. |
| `bun run dev -- memory:doctor` | Check Python, index, and environment readiness without printing secret values. |
| `bun run dev -- memory:build` | Build or rebuild the local memory index. |
| `bun run dev -- memory:query` | Return JSON memory query results. |
| `bun run dev -- memory:prompt` | Return an agent-ready context block from memory results. |
| `bun run dev -- memory:eval` | Run local retrieval regression cases. |

Development commands:

```bash
bun run lint
bun run test
bun run build
```

## Outputs

| File | Purpose |
| --- | --- |
| `session.raw.ndjson` | Normalized raw turns. |
| `transcript.txt` | Main continuation artifact. |
| `transcript.md` | Markdown transcript. |
| `transcript.report.json` | Transcript render metadata. |
| `export-transcript.report.json` | One-shot export metadata. |
| `images.enriched.jsonl` | OCR or image summaries when enabled. |
| `state_snapshot.json` | Compact stable state. |
| `preserved_tail.ndjson` | Recent raw context for handoff. |
| `handoff.md` | Human-readable handoff. |
| `resume_prompt.md` | Prompt for continuing in a new session. |

## Privacy Boundary

These paths are local and must not be committed:

- `.env`
- `out/`
- `memory/`
- `.claude/handoffs/`
- `memory-system/.claude/handoffs/`

Before pushing, verify:

```bash
git ls-files out memory .claude/handoffs memory-system/.claude/handoffs
```

The command should print nothing.

## Project Structure

```text
src/
  cli.ts
  commands/
    capture.ts
    exportTranscript.ts
    transcript.ts
    enrichImages.ts
    compress.ts
    handoff.ts
    memory-*.ts
  lib/
    extract.ts
    transcript.ts
    memory/
memory-system/
  src/
    cli.py
    normalizer.py
    chunker.py
    embedder.py
    retriever.py
    prompter.py
tests/
docs/
scripts/
```

## Troubleshooting

### Google sign-in appears

The browser profile does not have a usable AI Studio login. Use a cloned logged-in profile or attach to an already logged-in browser with remote debugging. Do not modify your main browser profile just to debug extraction.

### CDP cannot connect

Check the port and process state:

```bash
lsof -i :9222
```

If Chrome was already running without remote debugging, close the existing browser process and restart it with `bun run cdp:start`.

### Export tail is incomplete

Do not trust `turnCount` alone. Inspect:

```bash
tail -n 80 "$OUT/transcript.txt"
```

If the latest turns are missing or out of order, rerun the export and keep the browser tab active while the hydration loop runs.

### Memory query prints no chunks

Run:

```bash
set -a; source .env; set +a
bun run dev -- memory:doctor
```

If `memory/chroma` is missing, build the index first:

```bash
bun run dev -- memory:doctor --mode build
bun run dev -- memory:build --sessions-only --rebuild
```

## License

MIT. See [LICENSE](./LICENSE).
