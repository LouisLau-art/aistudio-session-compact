from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from src import embedder
from src import extractor
from src.retriever import MemoryRetriever


class TestExtractorConfig(unittest.TestCase):
    def tearDown(self) -> None:
        extractor._client = None
        embedder._client = None

    def test_requires_api_key_from_environment(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            extractor._client = None

            with self.assertRaisesRegex(RuntimeError, "LLM_API_KEY or ARK_API_KEY"):
                extractor._get_client()

    def test_embedder_requires_api_key_from_environment(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            embedder._client = None

            with self.assertRaisesRegex(RuntimeError, "SILICONFLOW_API_KEY"):
                embedder._get_client()

    def test_reranker_skips_api_when_key_missing(self) -> None:
        retriever = MemoryRetriever.__new__(MemoryRetriever)
        retriever.api_key = None
        retriever.rerank_model = "test-reranker"
        retriever.api_url = "https://example.invalid/rerank"

        with patch("src.retriever.requests.post") as post:
            scores, status, error = retriever._call_reranker_api("query", ["doc-a", "doc-b"])

        self.assertEqual(scores, [0.0, 0.0])
        self.assertEqual(status, "disabled")
        self.assertEqual(error, "")
        post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
