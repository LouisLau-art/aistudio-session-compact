# Memory System Runbook

This runbook covers the public-safe workflow for the local Python RAG sidecar. It intentionally documents environment variable names only. Do not paste API keys, generated transcripts, ChromaDB contents, handoffs, or private `memory/` outputs into tracked files.

## Privacy Boundary

These paths are local/private and must stay untracked:

- `out/`
- `memory/`
- `.claude/handoffs/`
- `memory-system/.claude/handoffs/`
- `docs/plans/2026-04-11-personal-memory-system-*`

Before pushing, verify:

```bash
git ls-files out memory .claude/handoffs memory-system/.claude/handoffs
```

The command should print nothing.

## Quick Check

Start with the doctor command. Use `--mode build` before a first build and the default query mode before query/prompt:

```bash
bun run dev -- memory:doctor --mode build
bun run dev -- memory:doctor
```

Expected shape for query mode:

```text
Memory doctor (query)
[OK] Python: OK - ...
[OK] memory-system: OK - ...
[OK] memory-system/src/cli.py: OK - ...
[OK] memory/chroma: OK - ...
[OK] SILICONFLOW_API_KEY: SET - required for build/query embeddings
[OK] LLM_API_KEY or ARK_API_KEY: SET - optional enrichment for persona/events extraction during build
[WARN] DASHSCOPE_API_KEY: MISSING - optional reranker; missing means vector search only
Result: READY
```

`memory:doctor` prints only `SET` or `MISSING` for environment variables. It exits non-zero when required items are missing.

## Commands

Use the Bun bridge from the repo root:

```bash
bun run dev -- memory:build
bun run dev -- memory:build --sessions-only --rebuild
bun run dev -- memory:query "用户教育背景"
bun run dev -- memory:prompt "当前任务背景"
bun run dev -- memory:eval --cases memory/evals/personal-golden.json
```

Direct Python usage is equivalent:

```bash
source ~/.venv/ml/bin/activate
cd memory-system
python -m src.cli build
python -m src.cli build --sessions-only --rebuild
python -m src.cli query "用户教育背景"
python -m src.cli prompt "当前任务背景"
python -m src.cli eval --cases ../memory/evals/personal-golden.json
```

Bridge overrides:

| Variable | Purpose |
| --- | --- |
| `MEMORY_PYTHON` | Python executable for the bridge. Defaults to `~/.venv/ml/bin/python` when present. |
| `MEMORY_SYSTEM_DIR` | Python sidecar directory. Defaults to `memory-system/`. |

Runtime variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SILICONFLOW_API_KEY` | yes | Query/build embeddings with BGE-M3. |
| `LLM_API_KEY` or `ARK_API_KEY` | no | Persona/events extraction during build. Missing keys produce chunk-only memory. |
| `LLM_BASE_URL` | no | OpenAI-compatible LLM endpoint. Defaults to Ark. |
| `LLM_MODEL` | no | Model or endpoint id for extraction. |
| `EMBEDDING_BATCH_SIZE` | no | Embedding request batch size. Defaults to `5`; increase only when the provider quota and network are stable. |
| `EMBEDDING_BATCH_DELAY` | no | Delay between embedding batches in seconds. Defaults to `0.5`. |
| `DASHSCOPE_API_KEY` | no | Optional reranker. Missing means vector search only. |

## Typical Flow

1. Export AI Studio sessions into `out/`.
2. Run `bun run dev -- memory:doctor --mode build`.
3. If required checks are missing, set the missing env vars in your shell or local ignored env loader.
4. Run `bun run dev -- memory:build`; use `--sessions-only` to skip external catalog docs and `--rebuild` to clear the existing Chroma index first.
5. Run `bun run dev -- memory:doctor` before query/prompt.
6. Query with `bun run dev -- memory:query "<question>"`.
7. Generate compact agent context with `bun run dev -- memory:prompt "<question>"`.
8. After changing retrieval, chunking, reranking, or agent query rules, run `bun run dev -- memory:eval --cases memory/evals/<local-file>.json`.

## Retrieval Evaluation

`memory:eval` runs retrieval-only golden checks. It does not call an answer-generating LLM. Each case asks a question, runs the normal hybrid retrieval path, then checks whether the retrieved chunks contain required evidence and avoid known wrong branches.

Keep real cases in ignored `memory/evals/`. Use `memory-system/evals/sample-golden-cases.json` as the public schema example.

Case fields:

| Field | Purpose |
| --- | --- |
| `id` | Stable case id. |
| `query` | User-facing question. |
| `must_include` | Terms that must appear in retrieved chunks. |
| `must_include_any` | List of alternative groups, such as `["5月12", "5.12"]`. |
| `must_not_include` | Terms that indicate a wrong branch. |
| `source_keywords` | Evidence terms expected from the source chunk. |
| `require_exact_hit` | Fails the case unless exact retrieval participates. |

Example:

```json
{
  "id": "sample-date-specific-event",
  "query": "5月12日的活动具体是什么？",
  "must_include": ["5月12", "模拟接力赛"],
  "must_not_include": ["Aurora"],
  "source_keywords": ["路线规划", "计时复盘"],
  "require_exact_hit": true
}
```

## Hybrid Retrieval

`memory:query` now merges exact search over `memory/chunks_meta.json` with Chroma vector search. Exact terms include date variants, Chinese phrases, and alphanumeric names. Results are reranked when `DASHSCOPE_API_KEY` is set. If reranking is disabled or fails, exact scores keep date/person/event facts from being buried by semantic noise.

The JSON output includes:

| Field | Meaning |
| --- | --- |
| `retrieval.exact_terms` | Exact terms extracted from the query. |
| `retrieval.exact_hits` | Number of exact chunk hits. |
| `retrieval.vector_hits` | Number of vector hits before merge. |
| `retrieval.rerank_status` | `ok`, `disabled`, `failed`, or `not_run`. |
| `retrieval.rerank_error` | Error text for failed remote reranking. |

## Troubleshooting

`SILICONFLOW_API_KEY: MISSING`:
Set the embedding key before `memory:build`, `memory:query`, or `memory:prompt`. The query path needs an embedding for the incoming question.

`LLM_API_KEY or ARK_API_KEY: MISSING`:
This is not fatal for chunk indexing. Build continues with empty persona/events enrichment; set one of these variables when you need `persona.json` and `events.ndjson` populated by the extractor.

`DASHSCOPE_API_KEY: MISSING`:
This is not fatal. Retrieval falls back to hybrid exact + vector ranking without remote reranking.

`retrieval.rerank_status: failed`:
The query still returns results, but the remote reranker did not participate. Check `retrieval.exact_hits` and exact evidence before making a high-confidence factual claim.

`memory/chroma: MISSING`:
For query/prompt, no local index exists yet. Run `memory:build` after required env vars are available. For first-build checks, use `bun run dev -- memory:doctor --mode build`; build mode treats a missing Chroma index as expected because it will be created.

Python or `memory-system/src/cli.py` missing:
Check `MEMORY_PYTHON`, `MEMORY_SYSTEM_DIR`, and the current working directory.

## Reliability Notes

The Bun bridge now runs preflight before `memory:build`, `memory:query`, `memory:prompt`, and `memory:eval`. Failed preflight renders the doctor summary and does not spawn Python. `memory:build` uses build mode, so an absent `memory/chroma` is allowed; query, prompt, and eval use query mode, so an absent index is fatal.

Remaining high-ROI improvement: add automatic loading for a local ignored env file if the project wants zero-manual-shell setup. Keep that loader secret-safe and avoid printing values.
