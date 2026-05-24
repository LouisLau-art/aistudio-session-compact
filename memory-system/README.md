# memory-system

Python RAG sidecar for building and querying local conversation memory.

This package is normally driven through the Bun bridge in the repo root:

```bash
bun run dev -- memory:doctor --mode build
bun run dev -- memory:doctor
bun run dev -- memory:build --sessions-only --rebuild
bun run dev -- memory:query "用户教育背景"
bun run dev -- memory:prompt "当前任务背景"
bun run dev -- memory:eval --cases memory/evals/personal-golden.json
```

## Usage

```bash
source ~/.venv/ml/bin/activate
python -m src.cli build --sessions-only --rebuild
python -m src.cli query "用户教育背景"
python -m src.cli prompt "当前任务背景"
python -m src.cli eval --cases ../memory/evals/personal-golden.json
```

`query` uses hybrid retrieval: exact search over local chunk metadata plus Chroma vector search, followed by DashScope reranking when `DASHSCOPE_API_KEY` is set. Query JSON includes `retrieval.exact_hits`, `retrieval.vector_hits`, and `retrieval.rerank_status`.

`eval` runs retrieval-only golden checks. Keep real cases in ignored `../memory/evals/`; use `evals/sample-golden-cases.json` as the public schema example.

## Environment

API keys are read from environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SILICONFLOW_API_KEY` | yes | Query/build embeddings. |
| `LLM_API_KEY` or `ARK_API_KEY` | no | Persona/events extraction during build. Missing keys produce chunk-only memory. |
| `EMBEDDING_BATCH_SIZE` | no | Embedding request batch size. Defaults to `5`. |
| `EMBEDDING_BATCH_DELAY` | no | Delay between embedding batches in seconds. Defaults to `0.5`. |
| `DASHSCOPE_API_KEY` | no | Optional reranker. |

Do not commit generated `../memory/` data. The public runbook is [`../docs/memory-system-runbook.md`](../docs/memory-system-runbook.md).
