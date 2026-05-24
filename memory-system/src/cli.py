from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

# 禁用所有代理环境变量（解决 socks:// 协议问题）
os.environ.pop("http_proxy", None)
os.environ.pop("https_proxy", None)
os.environ.pop("HTTP_PROXY", None)
os.environ.pop("HTTPS_PROXY", None)
os.environ.pop("all_proxy", None)
os.environ.pop("ALL_PROXY", None)
os.environ.pop("socks_proxy", None)
os.environ.pop("SOCKS_PROXY", None)

# 只在需要时单独设置
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

from src.normalizer import load_all_sessions
from src.extractor import extract_events, extract_persona
from src.chunker import chunk_conversation
from src.loader import load_all_external_docs
from src.embedder import embed_chunks
from src.store import MemoryStore
from src.retriever import MemoryRetriever
from src.prompter import format_context_for_agent
from src.types import TimelineEvent, Persona
from src.eval import load_cases, run_eval


def dataclass_to_dict(obj):
    """递归转换 dataclass 为 dict"""
    if hasattr(obj, "__dataclass_fields__"):
        return {k: dataclass_to_dict(v) for k, v in obj.__dict__.items()}
    if isinstance(obj, list):
        return [dataclass_to_dict(v) for v in obj]
    if isinstance(obj, dict):
        return {k: dataclass_to_dict(v) for k, v in obj.items()}
    return obj


def cmd_build(args):
    """离线构建记忆索引"""
    input_dir = Path(args.input)
    catalog_dir = Path(args.catalog).expanduser()
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    if getattr(args, "rebuild", False):
        chroma_dir = output_dir / "chroma"
        if chroma_dir.exists():
            shutil.rmtree(chroma_dir)

    # 1. 读取所有 session
    print(f"\n从 {input_dir} 加载对话...")
    all_turns = load_all_sessions(str(input_dir))

    if not all_turns:
        print("警告：没有找到任何对话数据")
        all_turns = []

    print(f"\n共 {len(all_turns)} turns，开始处理...")

    # 2. 提取人物画像
    if all_turns:
        print("\n[1/5] 提取人物画像...")
        persona = extract_persona(all_turns)
        (output_dir / "persona.json").write_text(
            json.dumps(dataclass_to_dict(persona), ensure_ascii=False, indent=2)
        )
    else:
        persona = Persona()

    # 3. 提取时间线事件
    if all_turns:
        print("[2/5] 提取时间线事件...")
        events = extract_events(all_turns)
        (output_dir / "events.ndjson").write_text(
            "\n".join(json.dumps(dataclass_to_dict(e), ensure_ascii=False) for e in events)
        )
    else:
        events = []

    # 4. 加载外部文档
    if getattr(args, "sessions_only", False):
        print("[3/5] 跳过外部文档（sessions-only）...")
        ext_chunks = []
    else:
        print("[3/5] 加载外部文档...")
        ext_chunks = load_all_external_docs(str(catalog_dir))

    # 5. 会话分块 + 合并
    print("[4/5] 分块...")
    session_chunks = chunk_conversation(all_turns, "all-sessions") if all_turns else []
    all_chunks = session_chunks + ext_chunks
    print(f"  总计 {len(all_chunks)} 个 chunks (对话: {len(session_chunks)}, 外部: {len(ext_chunks)})")

    print("[4/5] 向量化...")
    all_chunks = embed_chunks(all_chunks, show_progress=True)

    # 6. 存入 ChromaDB
    print("[5/5] 存入向量库...")
    store = MemoryStore(persist_dir=str(output_dir / "chroma"))
    store.add_chunks(all_chunks)

    # 保存 chunk 元数据
    chunk_meta = [
        {
            "id": c.id,
            "source_session_id": c.source_session_id,
            "source_turn_ids": c.source_turn_ids,
            "content": c.content,
            "topic": c.topic,
            "date": c.date,
        }
        for c in all_chunks
    ]
    (output_dir / "chunks_meta.json").write_text(
        json.dumps(chunk_meta, ensure_ascii=False, indent=2)
    )

    print(f"\n构建完成！")
    print(f"  persona: {output_dir / 'persona.json'}")
    print(f"  events:  {len(events)} 个事件")
    print(f"  chunks:  {len(all_chunks)} 个分块")
    print(f"  向量库:  {output_dir / 'chroma'}")


def cmd_query(args):
    """查询记忆"""
    retriever = MemoryRetriever(memory_dir=args.memory_dir)
    result = retriever.query(args.query)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_prompt(args):
    """生成给新 Agent 的提示词上下文"""
    retriever = MemoryRetriever(memory_dir=args.memory_dir)
    result = retriever.query(args.query, top_k=args.top_k)

    prompt_text = format_context_for_agent(result)
    print(prompt_text)


def cmd_eval(args):
    """运行记忆检索回归评估"""
    cases = load_cases(args.cases)
    retriever = MemoryRetriever(memory_dir=args.memory_dir)
    report = run_eval(cases, retriever, top_k=args.top_k)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report["summary"]["ok"]:
        raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser(description="个人数字记忆系统")
    sub = parser.add_subparsers(dest="command")

    build = sub.add_parser("build", help="构建记忆索引")
    build.add_argument("-i", "--input", default="../out/", help="对话输入目录")
    build.add_argument("-c", "--catalog", default="~/internship-jd-catalog/", help="实习文档目录")
    build.add_argument("-o", "--output", default="../memory/", help="输出目录")
    build.add_argument("--sessions-only", action="store_true", help="只索引对话 session，不加载外部文档")
    build.add_argument("--rebuild", action="store_true", help="写入前清理已有 Chroma 索引")

    query = sub.add_parser("query", help="查询记忆")
    query.add_argument("query", help="查询内容")
    query.add_argument("-d", "--memory-dir", default="../memory/", help="记忆目录")

    prompt = sub.add_parser("prompt", help="生成 Agent 提示词")
    prompt.add_argument("query", help="查询内容")
    prompt.add_argument("-d", "--memory-dir", default="../memory/", help="记忆目录")
    prompt.add_argument("-k", "--top-k", type=int, default=5, help="RAG 数量")

    eval_cmd = sub.add_parser("eval", help="运行记忆检索回归评估")
    eval_cmd.add_argument("--cases", required=True, help="golden eval cases JSON 文件")
    eval_cmd.add_argument("-d", "--memory-dir", default="../memory/", help="记忆目录")
    eval_cmd.add_argument("-k", "--top-k", type=int, default=5, help="RAG 数量")

    args = parser.parse_args()
    if args.command == "build":
        cmd_build(args)
    elif args.command == "query":
        cmd_query(args)
    elif args.command == "prompt":
        cmd_prompt(args)
    elif args.command == "eval":
        cmd_eval(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
