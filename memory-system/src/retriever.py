from __future__ import annotations
import os
import json
import re
import requests
from pathlib import Path
from src.types import Chunk, Persona, TimelineEvent
from src.store import MemoryStore
from src import embedder

# 设置 HuggingFace 镜像
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

class MemoryRetriever:
    def __init__(self, memory_dir: str = "../memory"):
        self.memory_path = Path(memory_dir)
        self.store = MemoryStore(persist_dir=str(self.memory_path / "chroma"))

        # DashScope (阿里) 配置
        self.api_key = os.environ.get("DASHSCOPE_API_KEY")
        self.rerank_model = "qwen3-vl-rerank"
        self.api_url = "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank"

    def _call_reranker_api(self, query: str, documents: list[str]) -> tuple[list[float], str, str]:
        """调用 DashScope 的 Qwen3-VL-Rerank API"""
        if not self.api_key:
            return [0.0] * len(documents), "disabled", ""

        payload = {
            "model": self.rerank_model,
            "input": {
                "query": query,
                "documents": documents
            },
            "parameters": {
                "return_documents": False,
                "top_n": len(documents)
            }
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        try:
            response = requests.post(self.api_url, json=payload, headers=headers, timeout=15)
            response.raise_for_status()
            data = response.json()

            # 解析 DashScope 返回的结构: data['output']['results']
            scores = [0.0] * len(documents)
            results = data.get("output", {}).get("results", [])
            for res in results:
                idx = res.get("index")
                score = res.get("relevance_score")
                if idx is not None:
                    scores[idx] = score
            return scores, "ok", ""
        except Exception as e:
            return [0.0] * len(documents), "failed", str(e)

    def query(self, text: str, top_k: int = 5) -> dict:
        """混合检索：Persona + Timeline + Qwen3 Reranked RAG"""
        # 1. 加载画像和时间线
        persona = self._load_persona()
        timeline = self._load_timeline()

        # 2. 精确检索 + 向量检索初筛。日期、人名、队名这类事实先用 exact 兜底。
        exact_terms = self._extract_exact_terms(text)
        exact_hits = self._exact_search(text, exact_terms, limit=10)
        vector_hits = self._vector_search(text, top_k=25)
        initial_hits = self._merge_hits(exact_hits, vector_hits)

        # 3. 远程 Reranking 重排序 (Qwen3-VL)
        rerank_status = "not_run"
        rerank_error = ""
        if initial_hits:
            docs = [hit["content"] for hit in initial_hits]
            scores, rerank_status, rerank_error = self._call_reranker_api(text, docs)

            # 将分数写回结果并重新排序
            for hit, score in zip(initial_hits, scores):
                hit["rerank_score"] = float(score)

            # rerank 可用时按 rerank；失败/禁用时 exact_score 优先，避免精确日期事实被语义噪声压下去。
            if rerank_status == "ok" and any(score > 0 for score in scores):
                initial_hits.sort(
                    key=lambda x: (
                        x.get("rerank_score", 0.0),
                        x.get("metadata", {}).get("exact_score", 0.0),
                    ),
                    reverse=True,
                )
            else:
                initial_hits.sort(
                    key=lambda x: (
                        x.get("metadata", {}).get("exact_score", 0.0),
                        -float(x.get("distance") or 0.0),
                    ),
                    reverse=True,
                )

            # 取最终 top_k
            final_hits = initial_hits[:top_k]
        else:
            final_hits = []

        return {
            "persona": persona,
            "timeline": timeline,
            "rag_chunks": final_hits,
            "retrieval": {
                "mode": "hybrid",
                "exact_terms": exact_terms,
                "exact_hits": len(exact_hits),
                "vector_hits": len(vector_hits),
                "rerank_status": rerank_status,
                "rerank_error": rerank_error,
            },
        }

    def _vector_search(self, text: str, top_k: int) -> list[dict]:
        hits = self.store.search(text, top_k=top_k)
        normalized = []
        for hit in hits:
            metadata = dict(hit.get("metadata") or {})
            metadata.setdefault("retrieval_source", "vector")
            metadata.setdefault("exact_score", 0.0)
            normalized.append({
                **hit,
                "metadata": metadata,
            })
        return normalized

    def _load_chunk_meta(self) -> list[dict]:
        path = self.memory_path / "chunks_meta.json"
        if not path.exists():
            return []
        try:
            data = json.loads(path.read_text())
        except Exception:
            return []
        if not isinstance(data, list):
            return []
        return [item for item in data if isinstance(item, dict)]

    def _exact_search(self, query: str, terms: list[str], limit: int = 10) -> list[dict]:
        if not terms:
            return []

        hits = []
        lower_terms = [(term, term.lower(), self._term_weight(term)) for term in terms]
        for item in self._load_chunk_meta():
            content = str(item.get("content", ""))
            content_lower = content.lower()
            score = 0.0
            matched_terms = []
            for original, lower, weight in lower_terms:
                count = content_lower.count(lower)
                if count:
                    score += weight * count
                    matched_terms.append(original)

            if score <= 0:
                continue

            metadata = {
                "retrieval_source": "exact",
                "exact_score": score,
                "matched_terms": matched_terms,
                "session_id": item.get("source_session_id", ""),
                "date": item.get("date", ""),
                "topic": item.get("topic", ""),
                "source_turn_ids": item.get("source_turn_ids", []),
            }
            hits.append({
                "id": item.get("id", ""),
                "content": content,
                "metadata": metadata,
                "distance": None,
                "rerank_score": 0.0,
            })

        hits.sort(key=lambda hit: hit["metadata"]["exact_score"], reverse=True)
        return hits[:limit]

    def _merge_hits(self, exact_hits: list[dict], vector_hits: list[dict]) -> list[dict]:
        merged = []
        seen: set[str] = set()

        for hit in exact_hits + vector_hits:
            key = str(hit.get("id") or hit.get("content", "")[:200])
            if key in seen:
                for existing in merged:
                    existing_key = str(existing.get("id") or existing.get("content", "")[:200])
                    if existing_key == key:
                        metadata = existing.setdefault("metadata", {})
                        metadata["retrieval_source"] = "hybrid"
                        metadata["exact_score"] = max(
                            float(metadata.get("exact_score", 0.0) or 0.0),
                            float((hit.get("metadata") or {}).get("exact_score", 0.0) or 0.0),
                        )
                        break
                continue

            seen.add(key)
            merged.append(hit)

        return merged

    def _extract_exact_terms(self, query: str) -> list[str]:
        terms: list[str] = []

        for match in re.finditer(r"(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*(?:日|号)?", query):
            month = int(match.group(1))
            day = int(match.group(2))
            terms.extend([
                f"{month}月{day}",
                f"{month}月{day}日",
                f"{month}.{day}",
            ])

        for match in re.finditer(r"([\u4e00-\u9fff]{2,12})", query):
            phrase = match.group(1)
            terms.append(phrase)
            for size in range(2, min(5, len(phrase)) + 1):
                for start in range(0, len(phrase) - size + 1):
                    terms.append(phrase[start:start + size])

        for match in re.finditer(r"[A-Za-z][A-Za-z0-9_-]{1,}", query):
            terms.append(match.group(0))

        deduped = []
        seen = set()
        for term in terms:
            clean = term.strip()
            if not clean or clean in seen:
                continue
            if len(clean) == 1:
                continue
            seen.add(clean)
            deduped.append(clean)
            if len(deduped) >= 40:
                break
        return deduped

    def _term_weight(self, term: str) -> float:
        if re.fullmatch(r"\d{1,2}月\d{1,2}(?:日)?|\d{1,2}\.\d{1,2}", term):
            return 8.0
        if re.search(r"[\u4e00-\u9fff]", term):
            return min(6.0, max(2.0, len(term) / 2))
        return 1.0

    def _load_persona(self) -> dict:
        p_path = self.memory_path / "persona.json"
        if p_path.exists():
            try:
                return json.loads(p_path.read_text())
            except:
                pass
        return {}

    def _load_timeline(self) -> list[dict]:
        t_path = self.memory_path / "events.ndjson"
        events = []
        if t_path.exists():
            for line in t_path.read_text().splitlines():
                if line.strip():
                    events.append(json.loads(line))
        return events
