from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_cases(path: str | Path) -> list[dict[str, Any]]:
    data = json.loads(Path(path).read_text())
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("cases"), list):
        return data["cases"]
    raise ValueError("eval cases must be a JSON array or an object with a cases array")


def evaluate_case(case: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    chunks = result.get("rag_chunks", [])
    haystack = "\n".join(str(chunk.get("content", "")) for chunk in chunks)
    retrieval = result.get("retrieval", {})

    required_terms = list(case.get("must_include", [])) + list(case.get("source_keywords", []))
    missing_terms = [term for term in required_terms if term and term not in haystack]
    for group in case.get("must_include_any", []):
        if not isinstance(group, list):
            continue
        alternatives = [str(term) for term in group if term]
        if alternatives and not any(term in haystack for term in alternatives):
            missing_terms.append("|".join(alternatives))
    forbidden_terms = [term for term in case.get("must_not_include", []) if term and term in haystack]

    exact_hit_count = int(retrieval.get("exact_hits", 0) or 0)
    has_exact_chunk = any(
        (chunk.get("metadata") or {}).get("retrieval_source") in {"exact", "hybrid"}
        for chunk in chunks
    )
    require_exact_hit = bool(case.get("require_exact_hit", False))
    exact_hit_ok = (not require_exact_hit) or exact_hit_count > 0 or has_exact_chunk

    passed = not missing_terms and not forbidden_terms and exact_hit_ok
    return {
        "id": case.get("id", ""),
        "query": case.get("query", ""),
        "passed": passed,
        "missing_terms": missing_terms,
        "forbidden_terms": forbidden_terms,
        "exact_hit_ok": exact_hit_ok,
        "rerank_status": retrieval.get("rerank_status", "unknown"),
        "exact_hits": exact_hit_count,
        "top_sources": [
            (chunk.get("metadata") or {}).get("retrieval_source", "unknown")
            for chunk in chunks[:3]
        ],
    }


def summarize_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    passed = sum(1 for item in results if item.get("passed"))
    total = len(results)
    failed = total - passed
    return {
        "ok": failed == 0,
        "total": total,
        "passed": passed,
        "failed": failed,
    }


def run_eval(cases: list[dict[str, Any]], retriever: Any, top_k: int = 5) -> dict[str, Any]:
    results = []
    for case in cases:
        query = str(case.get("query", "")).strip()
        if not query:
            results.append({
                "id": case.get("id", ""),
                "query": "",
                "passed": False,
                "missing_terms": ["query"],
                "forbidden_terms": [],
                "exact_hit_ok": False,
                "rerank_status": "not_run",
                "exact_hits": 0,
                "top_sources": [],
            })
            continue
        result = retriever.query(query, top_k=top_k)
        results.append(evaluate_case(case, result))

    summary = summarize_results(results)
    return {
        "summary": summary,
        "results": results,
    }
