# Memory System Diagnostics & Queries

## Mode Switch Strategy
- **Doctor**: Run `memory:doctor` before executing query runs to check SQLite connection and indexes.
- **Build**: Run `memory:build --sessions-only --rebuild` when schemas, vector dimensions, or segment sizes change.
- **Query**: Use `memory:query "<query>"` for locating exact matches, names, and event timestamps.
- **Prompt**: Use `memory:prompt "<query>"` to compile contextual backgrounds to start a new agent chat.

## Interpreting Query Results
When reviewing raw search results:
- **exact_hits > 0**: Confirms that physical exact keywords were successfully located. High confidence.
- **rerank_status = ok**: Validates that semantic rerank has completed. Prioritize top-ranked turns.
- **rerank_status = failed**: Downgrade search confidence; rely on exact hits.
