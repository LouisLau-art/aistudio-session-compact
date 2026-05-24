from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from src.retriever import MemoryRetriever


class _FakeStore:
    def __init__(self, persist_dir: str):
        self.persist_dir = persist_dir
        pass

    def search(self, _query: str, top_k: int = 5):
        return [
            {
                "content": "user: 演示项目 Aurora 报名材料和截止时间讨论",
                "metadata": {"session_id": "session-aurora", "topic": "demo-project"},
                "distance": 0.12,
            }
        ][:top_k]


class TestMemoryRetriever(unittest.TestCase):
    def test_query_promotes_exact_date_hits_over_semantic_noise(self):
        with TemporaryDirectory() as tmp:
            memory_dir = Path(tmp)
            (memory_dir / "chunks_meta.json").write_text(
                json.dumps(
                    [
                        {
                            "id": "chunk-event",
                            "source_session_id": "session-a",
                            "source_turn_ids": ["t-001"],
                            "content": (
                                "user: 有些事情忘了说了 活动5月12日举行 只限样例社团成员 "
                                "三、活动项目 模拟接力赛(含路线规划、道具交接、计时复盘) "
                                "队伍叫青山示例队。"
                            ),
                            "topic": "demo-event",
                            "date": "2026-05-12",
                        },
                        {
                            "id": "chunk-aurora",
                            "source_session_id": "session-b",
                            "source_turn_ids": ["t-002"],
                            "content": "user: 演示项目 Aurora 申请草稿",
                            "topic": "application",
                            "date": "2026-04-17",
                        },
                    ],
                    ensure_ascii=False,
                )
            )

            with patch("src.retriever.MemoryStore", _FakeStore):
                retriever = MemoryRetriever(memory_dir=str(memory_dir))
                result = retriever.query("演示项目 Aurora 5月12 一轮游 活动", top_k=2)

            self.assertEqual(result["rag_chunks"][0]["metadata"]["retrieval_source"], "exact")
            self.assertIn("模拟接力赛", result["rag_chunks"][0]["content"])
            self.assertIn("5月12", result["retrieval"]["exact_terms"])
            self.assertGreaterEqual(result["retrieval"]["exact_hits"], 1)

    def test_query_reports_rerank_failure_in_retrieval_metadata(self):
        class StoreWithVectorHit:
            def __init__(self, persist_dir: str):
                self.persist_dir = persist_dir
                pass

            def search(self, _query: str, top_k: int = 5):
                return [
                    {
                        "content": "user: 5月12 模拟接力赛 排班复盘",
                        "metadata": {"session_id": "session-a"},
                        "distance": 0.2,
                    }
                ][:top_k]

        with TemporaryDirectory() as tmp:
            memory_dir = Path(tmp)
            (memory_dir / "chunks_meta.json").write_text("[]")

            with (
                patch.dict("os.environ", {"DASHSCOPE_API_KEY": "test-key"}),
                patch("src.retriever.MemoryStore", StoreWithVectorHit),
                patch("src.retriever.requests.post", side_effect=RuntimeError("boom")),
            ):
                retriever = MemoryRetriever(memory_dir=str(memory_dir))
                result = retriever.query("5月12 模拟接力赛", top_k=1)

            self.assertEqual(result["retrieval"]["rerank_status"], "failed")
            self.assertIn("boom", result["retrieval"]["rerank_error"])
            self.assertEqual(result["rag_chunks"][0]["rerank_score"], 0.0)


if __name__ == "__main__":
    unittest.main()
