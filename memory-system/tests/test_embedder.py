from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from src import embedder
from src.types import Chunk


class _FlakyEmbeddings:
    def __init__(self):
        self.calls = 0

    def create(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            raise RuntimeError("Connection error.")
        return SimpleNamespace(
            data=[
                SimpleNamespace(index=0, embedding=[0.5] * 1024),
            ]
        )


class _FakeClient:
    def __init__(self):
        self.embeddings = _FlakyEmbeddings()


class _RecordingEmbeddings:
    def __init__(self):
        self.batch_sizes = []

    def create(self, **kwargs):
        batch = kwargs["input"]
        self.batch_sizes.append(len(batch))
        return SimpleNamespace(
            data=[
                SimpleNamespace(index=index, embedding=[float(index + 1)] * 1024)
                for index in range(len(batch))
            ]
        )


class _RecordingClient:
    def __init__(self):
        self.embeddings = _RecordingEmbeddings()


class TestEmbedder(unittest.TestCase):
    def test_embed_chunks_retries_transient_connection_errors(self):
        client = _FakeClient()
        chunk = Chunk(id="chunk-1", content="hello")

        with (
            patch.object(embedder, "_get_client", return_value=client),
            patch.object(embedder.time, "sleep", return_value=None),
        ):
            [result] = embedder.embed_chunks([chunk], show_progress=False)

        self.assertEqual(client.embeddings.calls, 2)
        self.assertEqual(result.embedding, [0.5] * 1024)

    def test_embed_chunks_reads_batch_size_from_environment(self):
        client = _RecordingClient()
        chunks = [
            Chunk(id="chunk-1", content="hello"),
            Chunk(id="chunk-2", content="world"),
            Chunk(id="chunk-3", content="again"),
        ]

        with (
            patch.object(embedder, "_get_client", return_value=client),
            patch.object(embedder.time, "sleep", return_value=None),
            patch.dict(embedder.os.environ, {"EMBEDDING_BATCH_SIZE": "2"}),
        ):
            embedder.embed_chunks(chunks, show_progress=False)

        self.assertEqual(client.embeddings.batch_sizes, [2, 1])


if __name__ == "__main__":
    unittest.main()
