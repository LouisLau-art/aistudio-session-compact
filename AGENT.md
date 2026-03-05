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
  - this `AGENT.md` when agent process expectations change

## Runtime Expectations
- Default package manager/runtime: `bun`
- Browser automation target: `chromium` (do not touch user Canary unless explicitly requested)
- Compression mode: local heuristic (no Gemini path)
