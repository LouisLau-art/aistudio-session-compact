from __future__ import annotations
import json
import os

# 禁用所有代理环境变量（解决 socks:// 协议问题）
for key in ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY",
            "all_proxy", "ALL_PROXY", "socks_proxy", "SOCKS_PROXY"]:
    os.environ.pop(key, None)

from openai import OpenAI

from src.types import SessionTurn, TimelineEvent, Persona

_client: OpenAI | None = None


def _get_api_key() -> str:
    api_key = os.environ.get("LLM_API_KEY") or os.environ.get("ARK_API_KEY")
    if not api_key:
        raise RuntimeError("LLM_API_KEY or ARK_API_KEY environment variable is required")
    return api_key


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        # 使用火山引擎 (Volcengine) 配置
        base_url = os.environ.get(
            "LLM_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"
        )
        _client = OpenAI(api_key=_get_api_key(), base_url=base_url)
    return _client


def call_doubao_chat(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 1.0,  # 系统固定值
    require_json: bool = True,
    reasoning_effort: str = "high", # 开启深度思考
) -> list[dict] | dict:
    """调用 LLM API，返回解析后的 JSON 数据"""
    client = _get_client()
    # 使用用户提供的 Endpoint ID
    model = model or os.environ.get("LLM_MODEL", "ep-m-20260327121004-zbsjr")

    try:
        # 根据 260215 文档，temperature 和 top_p 会被忽略，重点是 reasoning_effort
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            extra_body={
                "reasoning_effort": reasoning_effort
            }
        )
        text = resp.choices[0].message.content.strip()
    except Exception as e:
        print(f"DEBUG: API 调用异常: {e}")
        return []

    try:
        # 处理 Markdown 代码块
        clean_text = text
        if "```json" in text:
            clean_text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            clean_text = text.split("```")[1].split("```")[0].strip()

        parsed = json.loads(clean_text)

        # 结果校验与归一化
        if isinstance(parsed, list):
            return parsed

        if isinstance(parsed, dict):
            # 支持 {"data": [...]} 或 {"events": [...]} 等常见结构
            for key in ["data", "events", "timeline", "persona"]:
                if key in parsed and isinstance(parsed[key], list):
                    return parsed[key]
            return parsed

        return [parsed] if parsed else []

    except Exception as e:
        print(f"DEBUG: 解析失败! 错误类型: {type(e).__name__}, 错误详情: {e}")
        print(f"DEBUG: 原始响应内容: {text[:500]}...")
        return []


EVENT_PROMPT = """你是一个事件提取专家。请从以下对话中提取关键事件，输出 JSON 数组。

每个事件包含：
- id: evt-xxx 格式
- date: YYYY-MM-DD
- category: emotional | decision | milestone | project | health
- title: 简短标题
- summary: 1-2 句话摘要
- evidence_turn_ids: 对应 turn ID 数组
- tags: 关键词标签数组

对话：
{conversation}

只输出 JSON 数组，不要有任何多余文字。"""

PERSONA_PROMPT = """你是一个人物画像专家。请从以下历史对话中提取用户的个人画像。

输出一个 JSON 对象，包含：
- name: 姓名
- core_identity: 包含 education, career_stage, technical_stack
- relationships: 人物关系列表，每项包含 person, status, notes
- preferences: 包含 communication, workflow, music
- current_state: 包含 job_search 和 health

对话：
{conversation}

只输出 JSON 对象，不要有任何多余文字。"""


def extract_events(turns: list[SessionTurn]) -> list[TimelineEvent]:
    """从对话中提取时间线事件"""
    conversation = "\n\n".join(f"[{t.id}] {t.role}: {t.text}" for t in turns)
    prompt = EVENT_PROMPT.format(conversation=conversation[:30_000])

    try:
        parsed = call_doubao_chat(messages=[{"role": "user", "content": prompt}], require_json=True)

        if not parsed or not isinstance(parsed, list):
            return []

        events = []
        for e in parsed:
            if not isinstance(e, dict): continue
            events.append(TimelineEvent(
                id=e.get("id", ""),
                date=e.get("date", ""),
                category=e.get("category", ""),
                title=e.get("title", ""),
                summary=e.get("summary", ""),
                evidence_turn_ids=e.get("evidence_turn_ids", []),
                tags=e.get("tags", [])
            ))
        return events
    except Exception as e:
        print(f"extract_events failed: {e}")
        return []


def extract_persona(turns: list[SessionTurn]) -> Persona:
    """从对话中提取人物画像"""
    conversation = "\n\n".join(f"{t.role}: {t.text}" for t in turns)
    prompt = PERSONA_PROMPT.format(conversation=conversation[:30_000])

    try:
        data = call_doubao_chat(messages=[{"role": "user", "content": prompt}], require_json=True)

        if not data:
            return Persona()

        # 如果返回的是列表，取第一个
        if isinstance(data, list):
            data = data[0] if data else {}

        if not isinstance(data, dict):
            return Persona()

        return Persona(
            name=data.get("name", "用户"),
            core_identity=data.get("core_identity", {}),
            relationships=data.get("relationships", []),
            preferences=data.get("preferences", {}),
            current_state=data.get("current_state", {}),
        )
    except Exception as e:
        print(f"extract_persona failed: {e}")
        return Persona()
