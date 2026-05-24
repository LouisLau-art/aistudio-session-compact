from __future__ import annotations

import unittest

from src.eval import evaluate_case, summarize_results


class TestMemoryEval(unittest.TestCase):
    def test_evaluate_case_passes_when_required_terms_are_retrieved(self):
        result = {
            "retrieval": {"rerank_status": "disabled", "exact_hits": 1},
            "rag_chunks": [
                {
                    "content": "活动5月12日举行，项目是社团模拟接力赛，包含路线规划道具交接计时复盘。",
                    "metadata": {"retrieval_source": "exact"},
                }
            ],
        }
        case = {
            "id": "demo-event-0512",
            "query": "5月12日的活动具体是什么？",
            "must_include": ["5月12", "模拟接力赛"],
            "must_not_include": ["演示项目", "Aurora"],
            "source_keywords": ["路线规划", "道具交接", "计时复盘"],
            "require_exact_hit": True,
        }

        evaluation = evaluate_case(case, result)

        self.assertTrue(evaluation["passed"])
        self.assertEqual(evaluation["missing_terms"], [])
        self.assertEqual(evaluation["forbidden_terms"], [])

    def test_evaluate_case_fails_when_required_terms_are_missing(self):
        result = {
            "retrieval": {"rerank_status": "failed", "exact_hits": 0},
            "rag_chunks": [
                {
                    "content": "演示项目 Aurora 报名截止讨论。",
                    "metadata": {"retrieval_source": "vector"},
                }
            ],
        }
        case = {
            "id": "demo-event-0512",
            "query": "5月12日的活动具体是什么？",
            "must_include": ["模拟接力赛", "计时复盘"],
            "must_not_include": ["Aurora"],
            "source_keywords": ["5月12"],
            "require_exact_hit": True,
        }

        evaluation = evaluate_case(case, result)

        self.assertFalse(evaluation["passed"])
        self.assertEqual(evaluation["missing_terms"], ["模拟接力赛", "计时复盘", "5月12"])
        self.assertEqual(evaluation["forbidden_terms"], ["Aurora"])
        self.assertFalse(evaluation["exact_hit_ok"])
        self.assertEqual(evaluation["rerank_status"], "failed")

    def test_evaluate_case_accepts_any_of_term_groups(self):
        result = {
            "retrieval": {"rerank_status": "ok", "exact_hits": 1},
            "rag_chunks": [
                {
                    "content": "青山示例队报名参加 5.12 模拟接力赛，并提前观察蓝河示例队。",
                    "metadata": {"retrieval_source": "exact"},
                }
            ],
        }
        case = {
            "id": "date-variant",
            "query": "5月12日的活动是什么？",
            "must_include": ["模拟接力赛"],
            "must_include_any": [["5月12", "5.12"]],
            "require_exact_hit": True,
        }

        evaluation = evaluate_case(case, result)

        self.assertTrue(evaluation["passed"])
        self.assertEqual(evaluation["missing_terms"], [])

        missing_variant = evaluate_case(
            case,
            {
                "retrieval": {"rerank_status": "ok", "exact_hits": 1},
                "rag_chunks": [
                    {
                        "content": "青山示例队报名参加模拟接力赛。",
                        "metadata": {"retrieval_source": "exact"},
                    }
                ],
            },
        )
        self.assertFalse(missing_variant["passed"])
        self.assertEqual(missing_variant["missing_terms"], ["5月12|5.12"])

    def test_summarize_results_counts_passed_and_failed_cases(self):
        summary = summarize_results([
            {"passed": True},
            {"passed": False},
            {"passed": True},
        ])

        self.assertEqual(summary["total"], 3)
        self.assertEqual(summary["passed"], 2)
        self.assertEqual(summary["failed"], 1)
        self.assertFalse(summary["ok"])


if __name__ == "__main__":
    unittest.main()
