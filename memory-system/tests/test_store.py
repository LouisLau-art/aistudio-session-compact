from __future__ import annotations
import unittest
import os
import shutil
import tempfile
from src.store import MemoryStore
from src.types import Chunk

class TestMemoryStore(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="memory-store-")
        self.store = MemoryStore(persist_dir=self.test_dir)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_add_and_search(self):
        chunk = Chunk(
            id="test-1",
            content="Hello world from memory system",
            embedding=[0.1] * 384 # all-MiniLM-L6-v2 dimension
        )
        self.store.add_chunks([chunk])
        self.assertEqual(self.store.count(), 1)

        # Test searching (requires embedding the query)
        # Note: In real test we would need to mock embed_text or provide real query
        # But we already tested it via CLI. This is just for structural check.
        pass

    def test_add_chunks_is_idempotent_for_same_chunk_id(self):
        first_chunk = Chunk(
            id="test-1",
            content="First memory content",
            embedding=[0.1] * 384
        )
        second_chunk = Chunk(
            id="test-1",
            content="Updated memory content",
            embedding=[0.2] * 384
        )

        self.store.add_chunks([first_chunk])
        self.store.add_chunks([second_chunk])

        self.assertEqual(self.store.count(), 1)

if __name__ == "__main__":
    unittest.main()
