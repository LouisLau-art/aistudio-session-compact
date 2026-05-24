from __future__ import annotations
import json
import os
from pathlib import Path
from src.types import Chunk

MAX_CHUNK_CHARS = 2000

def chunk_text(text: str, source_id: str, source_file: str, prefix: str) -> list[Chunk]:
    """通用的文本分块逻辑"""
    chunks: list[Chunk] = []
    # 简单的按字符数分块，保留 10% 重叠
    step = int(MAX_CHUNK_CHARS * 0.9)
    for i in range(0, len(text), step):
        content = text[i : i + MAX_CHUNK_CHARS]
        chunks.append(Chunk(
            id=f"{prefix}-{source_id}-{i//step}",
            source_session_id=source_id,
            source_turn_ids=[source_file],
            content=content,
            date="", # 外部文档可能没有明确日期
        ))
    return chunks

def load_markdown_docs(root_dir: str) -> list[Chunk]:
    """加载所有 Markdown 文档"""
    root = Path(root_dir)
    chunks: list[Chunk] = []

    # docs 目录
    docs_dir = root / "docs"
    if docs_dir.exists():
        for md_file in docs_dir.rglob("*.md"):
            rel_path = md_file.relative_to(root)
            text = md_file.read_text(errors="ignore")
            source_id = str(rel_path).replace("/", "_").replace(".", "_")
            chunks.extend(chunk_text(text, source_id, str(rel_path), "doc"))

    # resumes 目录
    resumes_dir = root / "resumes" / "notes"
    if resumes_dir.exists():
        for md_file in resumes_dir.rglob("*.md"):
            rel_path = md_file.relative_to(root)
            text = md_file.read_text(errors="ignore")
            source_id = str(rel_path).replace("/", "_").replace(".", "_")
            chunks.extend(chunk_text(text, source_id, str(rel_path), "resume"))

    return chunks

def load_job_jsons(root_dir: str) -> list[Chunk]:
    """加载职位 JSON 数据"""
    root = Path(root_dir) / "data"
    chunks: list[Chunk] = []
    if not root.exists():
        return []

    for json_file in root.glob("*.json"):
        try:
            data = json.loads(json_file.read_text(errors="ignore"))
            if "jobs" in data:
                for idx, job in enumerate(data["jobs"]):
                    name = job.get("position_name", "Unknown Position")
                    company = job.get("company", "Unknown Company")
                    req = job.get("requirement", "")
                    desc = job.get("description", "")

                    text = f"Company: {company}\nPosition: {name}\n\nRequirement:\n{req}\n\nDescription:\n{desc}"
                    source_id = f"job-{json_file.stem}"
                    chunks.extend(chunk_text(text, source_id, str(json_file.name), f"job-{idx}"))
        except Exception as e:
            print(f"Error loading {json_file}: {e}")

    return chunks

def load_all_external_docs(root_dir: str) -> list[Chunk]:
    """加载所有外部实习文档"""
    print(f"\n从 {root_dir} 加载外部文档...")
    chunks = []
    chunks.extend(load_markdown_docs(root_dir))
    chunks.extend(load_job_jsons(root_dir))
    print(f"  加载了 {len(chunks)} 个外部文档分块")
    return chunks
