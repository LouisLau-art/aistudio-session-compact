---
name: person-context-pack
description: This skill should be used when the user asks to "extract relationship context", "build person briefings", "analyze chat details about aliases", "dossier specific friends", or wants to compile an auditable background pack from past ndjson archives. Make sure to trigger this skill when the user mentions recurring named individuals or aliases and requests summaries of past interactions or psychological boundaries.
user-invocable: true
---

# Person Context Pack

Build a consistent, auditable Markdown context dossier about a specific person or relationship from local chat archives.

## Workflow

### 1. Locate Sources
Scan local files for matches of named targets:
```bash
rg -l -uuu --glob '!node_modules/**' --glob '!dist/**' '<name|alias>' out .
```

### 2. Extract Facts
Parse raw `.ndjson` turns rather than compiled markdown transcripts to avoid duplication. Separate:
*   Explicit self-report details
*   User-side inferences
*   Previous LLM-side interpretations
*   Crucial personal or psychological boundaries

### 3. Verify Turn Coverage
Run the coverage validation script to confirm that all target-containing turns have been incorporated into the final background briefing file:
```bash
bun .claude/skills/person-context-pack/scripts/verify-coverage.js "<alias1,alias2>" "<briefing_file_path>" "<raw_turn_files...>"
```

## Additional Resources
### Example Output Format
Dossiers should contain: Summary, Fact Sheets, Timeline, Psychological boundaries, and an Auditable Evidence Index map linking back to source session IDs.
