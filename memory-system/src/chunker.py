from __future__ import annotations

from src.types import SessionTurn, Chunk
from src.normalizer import extract_date_from_turn

MAX_CHUNK_CHARS = 2000


def chunk_conversation(turns: list[SessionTurn], session_id: str) -> list[Chunk]:
    """把对话按大小分块，保留尾部重叠"""
    chunks: list[Chunk] = []
    buf_text: list[str] = []
    buf_ids: list[str] = []
    buf_size = 0
    idx = 0

    for turn in turns:
        turn_text = f"{turn.role}: {turn.text}\n"
        turn_size = len(turn_text)

        if buf_size + turn_size > MAX_CHUNK_CHARS and buf_size > 0:
            _flush_chunk(chunks, buf_text, buf_ids, session_id, idx, turns)
            idx += 1

            # 保留 10% 重叠
            overlap_n = max(1, len(buf_text) // 10)
            buf_text = buf_text[-overlap_n:]
            buf_ids = buf_ids[-overlap_n:]
            buf_size = sum(len(t) for t in buf_text)

        buf_text.append(turn_text)
        buf_ids.append(turn.id)
        buf_size += turn_size

    if buf_text:
        _flush_chunk(chunks, buf_text, buf_ids, session_id, idx, turns)

    return chunks


def _flush_chunk(
    chunks: list[Chunk],
    buf_text: list[str],
    buf_ids: list[str],
    session_id: str,
    idx: int,
    all_turns: list[SessionTurn],
) -> None:
    date = ""
    for tid in buf_ids:
        t = next((t for t in all_turns if t.id == tid), None)
        if t:
            d = extract_date_from_turn(t)
            if d:
                date = d
                break

    has_images = any(
        (t := next((t for t in all_turns if t.id == tid), None)) and t.images
        for tid in buf_ids
    )

    chunks.append(Chunk(
        id=f"{session_id}-chunk-{idx}",
        source_session_id=session_id,
        source_turn_ids=list(buf_ids),
        content="".join(buf_text),
        date=date,
        has_images=has_images,
    ))