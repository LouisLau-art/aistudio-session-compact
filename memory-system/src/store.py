from __future__ import annotations

import chromadb

from src.types import Chunk
from src.embedder import embed_text


class MemoryStore:
    """ChromaDB 向量存储封装"""

    def __init__(self, persist_dir: str | None = None):
        if persist_dir:
            self._client = chromadb.PersistentClient(path=persist_dir)
        else:
            self._client = chromadb.Client()
        self._collection = self._client.get_or_create_collection(
            name="personal-memory",
            metadata={"description": "个人记忆向量库"},
        )

    def add_chunks(self, chunks: list[Chunk]) -> None:
        if not chunks:
            return

        # 过滤掉没有 embedding 的 chunk
        valid_chunks = [c for c in chunks if c.embedding is not None]
        if not valid_chunks:
            return

        # 分批添加，避免超过 ChromaDB 限制 (5461)
        batch_size = 2000
        for i in range(0, len(valid_chunks), batch_size):
            batch = valid_chunks[i : i + batch_size]
            self._collection.upsert(
                ids=[c.id for c in batch],
                documents=[c.content for c in batch],
                embeddings=[c.embedding for c in batch], # type: ignore
                metadatas=[
                    {
                        "session_id": c.source_session_id,
                        "date": c.date,
                        "topic": c.topic,
                        "has_images": c.has_images,
                    }
                    for c in batch
                ],
            )

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        n_results = min(top_k, self._collection.count() or 1)
        if n_results == 0:
            return []

        # 使用一致的 embedding 模型生成查询向量
        query_vector = embed_text(query)

        results = self._collection.query(
            query_embeddings=[query_vector],
            n_results=n_results,
        )
        items = []
        if not results["documents"] or not results["documents"][0]:
            return items
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            items.append({"content": doc, "metadata": meta, "distance": dist})
        return items

    def count(self) -> int:
        return self._collection.count()
