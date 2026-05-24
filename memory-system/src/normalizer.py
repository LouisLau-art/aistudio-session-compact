from __future__ import annotations
import json
import re

from src.types import SessionTurn


def normalize_session(ndjson_content: str) -> list[SessionTurn]:
    """解析 session.raw.ndjson 为 SessionTurn 列表"""
    lines = [line.strip() for line in ndjson_content.strip().split("\n") if line.strip()]
    turns: list[SessionTurn] = []
    for line in lines:
        raw = json.loads(line)
        turns.append(SessionTurn(
            id=raw.get("id", ""),
            order=raw.get("order", 0),
            role=raw.get("role", "unknown"),
            text=raw.get("text", ""),
            source_url=raw.get("sourceUrl", ""),
            images=raw.get("images", []),
        ))
    return turns


def extract_date_from_turn(turn: SessionTurn) -> str | None:
    """从对话文本中提取日期"""
    # 匹配 "3月19号"、"3月19日" 格式
    m = re.search(r"(\d+)月(\d+)(?:号|日)", turn.text)
    if m:
        month, day = m.group(1).zfill(2), m.group(2).zfill(2)
        return f"2026-{month}-{day}"

    # 匹配 "2026-04-11" ISO 格式
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", turn.text)
    if m:
        return m.group(0)

    return None


def load_all_sessions(input_dir: str) -> list[SessionTurn]:
    """从目录加载所有 session.raw.ndjson"""
    from pathlib import Path
    input_path = Path(input_dir)
    all_turns: list[SessionTurn] = []

    for session_dir in sorted(input_path.iterdir()):
        if not session_dir.is_dir():
            continue
        ndjson_path = session_dir / "session.raw.ndjson"
        if not ndjson_path.exists():
            continue
        turns = normalize_session(ndjson_path.read_text())
        all_turns.extend(turns)
        print(f"  读取 {session_dir.name}: {len(turns)} turns")

    return all_turns