from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Persona:
    """人物画像"""
    name: str = "用户"
    core_identity: dict[str, Any] = field(default_factory=lambda: {
        "education": "",
        "career_stage": "",
        "technical_stack": [],
    })
    relationships: list[dict[str, Any]] = field(default_factory=list)
    preferences: dict[str, list[str]] = field(default_factory=lambda: {
        "communication": [],
        "workflow": [],
        "music": [],
    })
    current_state: dict[str, Any] = field(default_factory=lambda: {
        "job_search": {"status": "", "target_roles": [], "progress": {}},
        "health": {"recent_injuries": []},
    })


@dataclass
class TimelineEvent:
    """时间线事件"""
    id: str = ""
    date: str = ""
    category: str = ""  # emotional | decision | milestone | project | health
    title: str = ""
    summary: str = ""
    evidence_turn_ids: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)


@dataclass
class Chunk:
    """RAG 分块"""
    id: str = ""
    source_session_id: str = ""
    source_turn_ids: list[str] = field(default_factory=list)
    content: str = ""
    topic: str = ""
    date: str = ""
    has_images: bool = False
    emotional_intensity: str = "medium"  # low | medium | high
    embedding: list[float] | None = None


@dataclass
class SessionTurn:
    """对话 turn（来自 ndjson）"""
    id: str = ""
    order: int = 0
    role: str = ""  # user | model | system
    text: str = ""
    source_url: str = ""
    images: list[dict[str, Any]] = field(default_factory=list)
