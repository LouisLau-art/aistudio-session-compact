# AGENT.md

## Scope
This file applies to this repository (`aistudio-session-compact`) and supplements global agent instructions.

## Mandatory Workflow
1. Use relevant local skills first.
2. For third-party library/framework behavior that may drift over time, use Context7 before coding.
3. Prefer authoritative docs-backed decisions over memory.

## Skills + Context7 Policy
- If a task touches Playwright, Bun, OCR libraries, CLI tooling, or API options, treat it as documentation-sensitive.
- Resolve the library with Context7, then query the exact API behavior you depend on.
- Record the decision in code comments or docs when behavior is non-obvious.

## Documentation Sync Rule
- After architecture or workflow changes, update:
  - `README.md`
  - `docs/plans/*` relevant design/implementation context
  - `CLAUDE.md` for project commands/structure changes
  - this `AGENT.md` when agent process expectations change
  - related reusable global skills when the workflow should be repeatable outside this repo

## Build/Test/Lint Commands
```bash
bun install    # Install dependencies
bun run build  # TypeScript build
bun run test   # Run vitest tests
bun run lint   # Type check only (tsc --noEmit)
```

## Memory System Bridge
- `bun run dev -- memory:doctor` checks Python, local index data, and env readiness without printing secret values.
- `bun run dev -- memory:build` delegates to `memory-system`'s Python CLI.
- `bun run dev -- memory:query "<query>"` delegates to `python -m src.cli query`.
- `bun run dev -- memory:prompt "<query>"` delegates to `python -m src.cli prompt`.
- `bun run dev -- memory:eval --cases memory/evals/<file>.json` runs local retrieval regression checks.
- For date/person/event questions, use exact evidence first (`rg` or `memory:query` hybrid exact hits), then semantic RAG. Do not rely on vector search alone when the answer depends on one concrete date or named event.
- Check `retrieval.rerank_status` in `memory:query` output. Treat `failed` or `disabled` as lower confidence unless exact hits establish the fact.
- Default Python is `~/.venv/ml/bin/python`; override with `MEMORY_PYTHON`.
- Keep generated `memory/` data local; it contains private user context.
- Keep real eval cases under ignored `memory/evals/`; only sanitized examples belong in tracked files.
- See `docs/memory-system-runbook.md` before changing build/query behavior.

## Runtime Expectations
- Default package manager/runtime: `bun`
- Browser automation target: `chromium` (do not touch user Canary unless explicitly requested)
- Compression mode: local heuristic (no Gemini path)
- Test runner: `vitest`

## Agent Client Usage
- Treat this repository as a local CLI toolbox. Codex, Claude Code, Gemini CLI, and OpenCode can all use it through shell commands; MCP is optional, not required.
- Claude Code can use project skills such as `/aistudio-export-text` and `/memory-workflow`.
- Codex, Gemini CLI, and OpenCode should read `README.md` plus this file, then run the same `bun run dev -- ...` commands directly.
- Before any memory command, load local env with `set -a; source .env; set +a`; never print `.env` values.
- Do not commit or paste private outputs from `out/`, `memory/`, `.claude/handoffs/`, or `memory-system/.claude/handoffs/`.
- If a cross-client workflow becomes stable, document it here and sync it as a project/global skill instead of repeating ad-hoc chat instructions.

## AI Studio Export Expectations
- Default to plain chat-text export when the user only wants conversation text; do not enable OCR or image enrichment unless explicitly requested.
- For long-session acceptance, verify transcript tail timestamps/content in `transcript.txt` or `session.raw.ndjson`; do not rely on `turnCount` alone.
- If capture misses recent turns or produces an out-of-order tail, suspect AI Studio virtualized `ms-chat-turn` hydration loss first and prefer the denser DOM-order hydration path over another sparse sweep.
- If a rerun is copied into the canonical output directory, fix report paths so they reference the canonical location rather than the temporary rerun directory.
- If the default CDP launch path assumes `chromium` and fails, prefer attaching to an already logged-in Chrome/Chromium session with remote debugging before concluding the export pipeline is broken.
- For authentication issues: if fresh browser contexts from disk profiles redirect to Google sign-in, use a cloned profile or attach to a running logged-in browser session instead of modifying capture logic.
- For browser lock files: clean up SingletonLock and database LOCK files in the profile directory if Chrome fails to start due to process singleton conflicts.

## Project Structure Reference
- `src/commands/` - CLI subcommands (capture, transcript, compress, handoff, memory bridge, etc.)
- `src/lib/` - Core logic (extract, render, transcript, compaction, OCR)
- `tests/` - Vitest unit tests
- `docs/plans/` - Design/implementation history
- See `CLAUDE.md` for full directory structure and command cheatsheet
