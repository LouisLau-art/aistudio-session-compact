from __future__ import annotations

import json
import unittest
from argparse import Namespace
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from src import cli
from src.types import Chunk, SessionTurn


class _FakeStore:
    def __init__(self, persist_dir: str):
        self.persist_dir = persist_dir
        self.added_chunks = None

    def add_chunks(self, chunks):
        self.added_chunks = chunks


class TestCliBuildOptions(unittest.TestCase):
    def test_sessions_only_skips_external_catalog_loader(self):
        with TemporaryDirectory() as tmp:
            output = Path(tmp) / "memory"
            args = Namespace(
                input=str(Path(tmp) / "out"),
                catalog=str(Path(tmp) / "catalog"),
                output=str(output),
                sessions_only=True,
                rebuild=False,
            )

            with (
                patch.object(cli, "load_all_sessions", return_value=[SessionTurn(id="t-001", role="user", text="x")]),
                patch.object(cli, "load_all_external_docs") as load_external_docs,
                patch.object(cli, "embed_chunks", side_effect=lambda chunks, show_progress=True: chunks),
                patch.object(cli, "MemoryStore", _FakeStore),
            ):
                cli.cmd_build(args)

            load_external_docs.assert_not_called()

    def test_rebuild_removes_existing_chroma_directory_before_writing(self):
        with TemporaryDirectory() as tmp:
            output = Path(tmp) / "memory"
            stale_file = output / "chroma" / "stale.txt"
            stale_file.parent.mkdir(parents=True)
            stale_file.write_text("stale")
            args = Namespace(
                input=str(Path(tmp) / "out"),
                catalog=str(Path(tmp) / "catalog"),
                output=str(output),
                sessions_only=True,
                rebuild=True,
            )

            with (
                patch.object(cli, "load_all_sessions", return_value=[SessionTurn(id="t-001", role="user", text="x")]),
                patch.object(cli, "load_all_external_docs") as load_external_docs,
                patch.object(cli, "embed_chunks", side_effect=lambda chunks, show_progress=True: chunks),
                patch.object(cli, "MemoryStore", _FakeStore),
            ):
                cli.cmd_build(args)

            load_external_docs.assert_not_called()
            self.assertFalse(stale_file.exists())

    def test_build_writes_full_chunk_content_for_exact_search(self):
        with TemporaryDirectory() as tmp:
            output = Path(tmp) / "memory"
            full_content = "a" * 240 + " 活动5月12日举行，项目是模拟接力赛。"
            args = Namespace(
                input=str(Path(tmp) / "out"),
                catalog=str(Path(tmp) / "catalog"),
                output=str(output),
                sessions_only=True,
                rebuild=False,
            )

            chunk = Chunk(
                id="chunk-1",
                source_session_id="session-a",
                source_turn_ids=["t-001"],
                content=full_content,
                embedding=[0.1, 0.2],
            )

            session_turn = SessionTurn(id="t-001", role="user", text="x")

            with (
                patch.object(cli, "load_all_sessions", return_value=[session_turn]),
                patch.object(cli, "load_all_external_docs") as load_external_docs,
                patch.object(cli, "chunk_conversation", return_value=[chunk]),
                patch.object(cli, "embed_chunks", side_effect=lambda chunks, show_progress=True: chunks),
                patch.object(cli, "MemoryStore", _FakeStore),
            ):
                cli.cmd_build(args)

            load_external_docs.assert_not_called()
            meta = json.loads((output / "chunks_meta.json").read_text())
            self.assertEqual(meta[0]["content"], full_content)


if __name__ == "__main__":
    unittest.main()
