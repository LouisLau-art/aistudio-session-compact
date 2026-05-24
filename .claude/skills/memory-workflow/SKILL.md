---
name: memory-workflow
description: This skill should be used when the user asks to "check memory indexes", "query long-term memories", "generate agent prompts", "rebuild SQLite schemas", "evaluate vector queries", "/memory-prompt", or query historical profiles (e.g. user education, job requirements, mock schedules). Always route memory checkups, factual query retrievals, or index diagnostics through this workflow.
disable-model-invocation: false
user-invocable: true
---

# Memory System Console

Access and govern the repository local SQLite and vector memory indexes.

## Unified Operations

### 1. Index Diagnostics
Always analyze the memory system state before running queries:
```bash
set -a; source .env; set +a
bun run dev -- memory:doctor
```

### 2. Fact Retrieval
Perform exact-hit and semantic queries:
```bash
bun run dev -- memory:query "<search_query>"
```

### 3. Agent Context Prompts (Alias for /memory-prompt)
Synthesize formatted context prompts to bootstrap a new workspace or agent session:
```bash
bun run dev -- memory:prompt "<profile_query>"
```

### 4. Rebuild Index
Reconstruct memory indices completely:
```bash
bun run dev -- memory:doctor --mode build
```
```bash
bun run dev -- memory:build --sessions-only --rebuild
```

## Additional Resources

### Reference Files
For comprehensive query metrics, rerank troubleshooting, and regression evaluation, consult:
- **`references/workflows.md`** - Advanced diagnostic details
