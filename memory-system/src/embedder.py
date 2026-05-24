from __future__ import annotations
import os
import time
import json
from openai import OpenAI
from src.types import Chunk

# 禁用所有代理环境变量
for key in ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY",
            "all_proxy", "ALL_PROXY", "socks_proxy", "SOCKS_PROXY"]:
    os.environ.pop(key, None)

_client: OpenAI | None = None


def _get_api_key() -> str:
    api_key = os.environ.get("SILICONFLOW_API_KEY")
    if not api_key:
        raise RuntimeError("SILICONFLOW_API_KEY environment variable is required")
    return api_key


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        base_url = "https://api.siliconflow.cn/v1"
        _client = OpenAI(api_key=_get_api_key(), base_url=base_url)
    return _client

def _get_model_id() -> str:
    return os.environ.get("EMBEDDING_MODEL_ID", "BAAI/bge-m3")

def _get_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError:
        return default
    return max(minimum, min(maximum, value))

def _get_float_env(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.environ.get(name, str(default)))
    except ValueError:
        return default
    return max(minimum, min(maximum, value))

def _is_retryable_error(err_msg: str) -> bool:
    lowered = err_msg.lower()
    return (
        "429" in lowered
        or "rate limiting" in lowered
        or "connection error" in lowered
        or "timeout" in lowered
        or "timed out" in lowered
        or "connection reset" in lowered
    )

def embed_text(text: str) -> list[float]:
    """生成单条文本的 embedding，带重试逻辑"""
    client = _get_client()
    model_id = _get_model_id()

    # 简单的自动截断 (BGE-M3 限制 8192 tokens, 约 1.5w 汉字)
    text = text[:15000]

    for attempt in range(3):
        try:
            resp = client.embeddings.create(
                model=model_id,
                input=text,
                encoding_format="float"
            )
            return resp.data[0].embedding
        except Exception as e:
            if _is_retryable_error(str(e)):
                wait_time = (attempt + 1) * 5
                time.sleep(wait_time)
                continue
            print(f"SiliconFlow Embedding 错误: {e}")
            break
    return [0.0] * 1024

def embed_chunks(chunks: list[Chunk], show_progress: bool = True) -> list[Chunk]:
    """批量生成 chunk embedding，带严格限速和截断"""
    client = _get_client()
    model_id = _get_model_id()

    # 截断超长文本
    texts = [c.content[:15000] for c in chunks]

    # 默认小批次适配免费/低额度账号；本地可用环境变量按网络和额度调优。
    batch_size = _get_int_env("EMBEDDING_BATCH_SIZE", 5, 1, 100)
    batch_delay = _get_float_env("EMBEDDING_BATCH_DELAY", 0.5, 0.0, 10.0)
    all_embeddings = []

    total = len(texts)
    for i in range(0, total, batch_size):
        batch_texts = texts[i : i + batch_size]
        if show_progress:
            print(f"  正在 SiliconFlow 向量化 (BGE-M3): {i}/{total}...", end="\r")

        success = False
        for attempt in range(5): # 最多重试 5 次
            try:
                resp = client.embeddings.create(
                    model=model_id,
                    input=batch_texts,
                    encoding_format="float"
                )
                sorted_data = sorted(resp.data, key=lambda x: x.index)
                all_embeddings.extend([d.embedding for d in sorted_data])
                success = True
                break
            except Exception as e:
                err_msg = str(e)
                if _is_retryable_error(err_msg):
                    # 遇到限速或临时网络错误，指数级退避
                    wait_time = (attempt + 1) * 10
                    time.sleep(wait_time)
                elif "413" in err_msg or "too large" in err_msg:
                    # 如果还是太大，强制进一步截断
                    batch_texts = [t[:5000] for t in batch_texts]
                    continue
                else:
                    print(f"\nSiliconFlow 批量 Embedding 非限速错误 (offset {i}): {e}")
                    break

        if not success:
            all_embeddings.extend([[0.0] * 1024] * len(batch_texts))

        if batch_delay:
            time.sleep(batch_delay)

    for chunk, emb in zip(chunks, all_embeddings):
        chunk.embedding = emb

    return chunks
