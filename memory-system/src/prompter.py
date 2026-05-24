from __future__ import annotations
from typing import Any

def format_context_for_agent(retrieval_result: dict[str, Any]) -> str:
    """将检索结果格式化为系统提示词上下文"""
    lines = []

    # 1. 人物画像
    persona = retrieval_result.get("persona")
    if persona:
        lines.append("# 用户个人画像")
        lines.append(f"- 核心身份: {persona.get('core_identity', {})}")

        lines.append("- 人物关系:")
        for rel in persona.get("relationships", []):
            lines.append(f"  * {rel.get('person')} ({rel.get('status')}): {rel.get('notes')}")

        lines.append("- 偏好:")
        lines.append(f"  * 沟通: {persona.get('preferences', {}).get('communication')}")
        lines.append(f"  * 工作流: {persona.get('preferences', {}).get('workflow')}")
        lines.append(f"  * 音乐: {persona.get('preferences', {}).get('music')}")

        lines.append("- 当前状态:")
        lines.append(f"  * 求职: {persona.get('current_state', {}).get('job_search')}")
        lines.append(f"  * 健康: {persona.get('current_state', {}).get('health')}")
        lines.append("")

    # 2. 时间线事件
    timeline = retrieval_result.get("timeline", [])
    if timeline:
        lines.append("# 近期关键记忆 (时间线)")
        for event in timeline:
            lines.append(f"- [{event.get('date')}] {event.get('title')}: {event.get('summary')}")
            if event.get("tags"):
                lines.append(f"  标签: {', '.join(event.get('tags'))}")
        lines.append("")

    # 3. RAG 知识分块
    rag_chunks = retrieval_result.get("rag_chunks", [])
    if rag_chunks:
        lines.append("# 相关知识与细节 (RAG)")
        for idx, chunk in enumerate(rag_chunks):
            lines.append(f"## 参考资料 {idx+1}")
            lines.append(chunk.get("content", "").strip())
            lines.append("")

    return "\n".join(lines)
