# aistudio-session-compact - 项目配置

## 项目概述
导出 Google AI Studio 长对话会话的 transcript-first CLI 工具。通过 CDP 连接已登录的 Chrome 标签页，默认生成 `transcript.txt` / `transcript.md`；OCR、压缩交接和 Python RAG 记忆刷新都是按需步骤。

## 命令速查
```bash
# Node.js / Bun (TypeScript CLI)
bun install              # 安装依赖
bun run build            # 构建 (tsc -p tsconfig.build.json)
bun run test             # 运行测试 (vitest run)
bun run lint             # 类型检查 (tsc --noEmit)
bun run dev              # 运行 CLI (tsx src/cli.ts)
bun run cdp:start        # 启动 CDP 浏览器
bun run transcript:headless  # 无头模式导出对话
bun run pipeline:headless    # 完整管道（旧版）
bun run dev -- memory:build  # 桥接 Python CLI 构建记忆索引
bun run dev -- memory:doctor # 检查 Python/索引/env 是否可用，不输出 key 值
bun run dev -- memory:query "..."   # 桥接 Python CLI 查询记忆
bun run dev -- memory:prompt "..."  # 桥接 Python CLI 生成 Agent 上下文
bun run dev -- memory:eval --cases memory/evals/<file>.json  # 本地检索回归评估

# Memory System (Python RAG)
source ~/.venv/ml/bin/activate  # 激活全局 ML 环境
cd memory-system
python -m src.cli build         # 1. 构建记忆索引 (包含对话和实习文档)
python -m src.cli query "..."   # 2. 查询相关细节
python -m src.cli prompt "..."  # 3. 生成给新 Agent 的提示词上下文
python -m src.cli eval --cases ../memory/evals/<file>.json  # 4. 检索回归评估
```

注意：TypeScript 的 `memory:*` 命令只是桥接层，实际执行仍在 `memory-system/` 下的 Python CLI。默认 Python 解释器是 `~/.venv/ml/bin/python`，可用 `MEMORY_PYTHON` 覆盖；默认子项目目录是 `memory-system/`，可用 `MEMORY_SYSTEM_DIR` 覆盖。
`memory:doctor` 只输出 `SET`/`MISSING`，不会打印任何环境变量值；缺少必需项时返回非零状态。

## 默认工作流

### AI Studio URL -> 纯文本导出
当用户只给 AI Studio URL，或说“处理/导出/看看这个”但没有明确要求压缩、handoff 或刷新记忆时，默认只做 transcript-first 导出：

```bash
OUT="out/<prompt-id>-$(date +%Y%m%d)"
bun run dev -- export-transcript \
  --cdp-url http://127.0.0.1:9222 \
  --url-match "aistudio.google.com/prompts/<prompt-id>" \
  --out "$OUT" \
  --provider none \
  --max-image-screenshots 0

wc -lc "$OUT/transcript.txt"
tail -n 80 "$OUT/transcript.txt"
```

验收标准是尾部内容和顺序正确；不要只看 `turnCount`。除非用户明确要求图片/OCR，否则不要加 `--with-images`。

### 压缩和交接
只有用户明确要求“压缩、接力、handoff、resume prompt、继续对话上下文”时才运行 `compress` 和 `handoff`。`compact/` 产物是备用交接材料，不是处理 AI Studio URL 的默认输出。

### 长期记忆
只有用户明确要求刷新长期记忆、查询历史上下文，或需要把新导出的 session 纳入 RAG 时才运行 `memory:*`：

```bash
set -a; source .env; set +a
bun run dev -- memory:doctor --mode build
bun run dev -- memory:build --sessions-only --rebuild
bun run dev -- memory:doctor
```

`.env` 是本地 ignored 文件；任何文档、handoff、commit message 都只写环境变量名，不能写实际 key。

查询具体日期、人物、比赛、队伍或事件时，必须先走精确证据，再走语义检索：`memory:query` 已合并 exact hit + vector search，并在 JSON 的 `retrieval` 块里显示 `exact_terms`、`exact_hits`、`vector_hits`、`rerank_status`。如果 `rerank_status` 是 `failed` 或 `disabled`，回答要降级置信度，除非 exact hit 已经明确支持事实。

修改 RAG、chunk、rerank 或 agent 查询策略后，优先运行本地 ignored 的 golden eval：

```bash
set -a; source .env; set +a
bun run dev -- memory:eval --cases memory/evals/personal-golden.json
```

真实个人 eval case 只放在 ignored 的 `memory/evals/`；tracked 文档只放脱敏样例。

### 浏览器和 CDP
优先连接已登录的 CDP 浏览器标签页。若新 profile 跳 Google 登录页，使用克隆的已登录 profile 或附加到已登录浏览器；不要修改原始浏览器 profile。临时克隆目录用完后清理。

## 跨 Agent 使用
- 这个仓库是本地 CLI 工具箱，不要求先做成 MCP；Codex、Claude Code、Gemini CLI、OpenCode 都可以通过 shell 命令使用。
- Claude Code 优先用项目技能 `/aistudio-export-text` 和 `/memory-workflow`。
- Codex/Gemini/OpenCode 先读 `README.md` 和 `AGENT.md`，再运行同一套 `bun run dev -- ...` 命令；不要假设它们会自动加载 `.claude/skills`。
- 交给任意 Agent 的默认约束：不打印 `.env`，不提交 `out/`、`memory/`、`.claude/handoffs/`、`memory-system/.claude/handoffs/`，AI Studio URL 默认只做 transcript-first 导出。

## 目录结构
```
src/
  ├── cli.ts                    # 入口点 (commander CLI)
  ├── commands/                 # 子命令
  │   ├── capture.ts            # CDP 捕获和 DOM 水化
  │   ├── transcript.ts         # 纯文本/Markdown 导出
  │   ├── exportTranscript.ts   # 一站式对话导出
  │   ├── enrichImages.ts       # 图像 OCR/多模态丰富化
  │   ├── compress.ts           # 会话压缩
  │   ├── handoff.ts            # 交接文档生成
  │   └── pipeline.ts           # 完整管道（旧版）
  ├── lib/                      # 核心库
  │   ├── extract.ts            # AI Studio DOM 提取器
  │   ├── transcript.ts         # 对话渲染逻辑
  │   ├── render.ts             # Markdown/文本渲染
  │   ├── state-snapshot.ts     # 状态快照生成
  │   ├── compaction-tail.ts    # 保留尾部处理
  │   ├── chunking.ts           # 文本分块
  │   ├── ocr.ts                # OCR 引擎 (tesseract/paddle)
  │   ├── doubao.ts             # 豆包多模态 API
  │   ├── briefing.ts           # 故事简报加载
  │   ├── sessionGuard.ts       # 捕获质量门控
  │   └── fs.ts                 # 文件系统工具
  └── types.ts                  # 类型定义

memory-system/                  # 个人数字记忆系统 (Python RAG)
  ├── src/
  │   ├── cli.py                # Python CLI 入口 (build/query/prompt)
  │   ├── normalizer.py         # 对话 NDJSON 解析
  │   ├── extractor.py          # LLM 提取 (画像/事件 - 智谱 GLM-4.7-Flash)
  │   ├── loader.py             # 实习目录文档加载器
  │   ├── chunker.py            # 分块逻辑 (2000 chars)
  │   ├── embedder.py           # 向量化 (all-MiniLM-L6-v2)
  │   ├── store.py              # ChromaDB 封装
  │   ├── retriever.py          # hybrid exact + vector + rerank 检索逻辑
  │   ├── eval.py               # retrieval golden eval
  │   └── prompter.py           # 提示词组装模板
  ├── evals/                    # 脱敏 eval 样例
  ├── pyproject.toml            # uv 依赖管理
  └── uv.lock                   # 依赖锁定

tests/                          # Vitest 测试
docs/plans/                     # 设计文档
examples/                       # 示例简报
scripts/                        # 辅助脚本
out/                            # 输出目录 (gitignored)
dist/                           # 构建输出 (gitignored)
.claude/                        # Claude Code 本地自动化配置
  ├── skills/                   # 项目级技能
  ├── agents/                   # 项目级子代理
  └── settings.json             # hooks/permissions
```

## 关键文件速查
- `src/commands/capture.ts` - CDP 连接、虚拟滚动水化、turn 提取
- `src/lib/extract.ts` - AI Studio DOM 选择器和回退策略
- `src/lib/transcript.ts` - 对话导出核心逻辑
- `src/lib/memory/doctor.ts` - memory doctor 检查项与渲染逻辑
- `docs/memory-system-runbook.md` - 公开安全的记忆系统运行手册
- `AGENT.md` - Agent 详细工作流约定（必看）

## 测试策略
- 使用 Vitest 进行单元测试
- 优先测试：压缩分块、状态快照、渲染逻辑、DOM 提取
- `bun run test` 运行所有测试

## 环境变量
| 变量 | 说明 |
|------|------|
| `DOUBAO_API_KEY` | 豆包 API Key（多模态图像摘要） |
| `LLM_API_KEY` / `ARK_API_KEY` | LLM API Key（用于 memory extractor，禁止在代码中写死） |
| `LLM_BASE_URL` | OpenAI-compatible LLM endpoint，默认火山引擎 Ark |
| `LLM_MODEL` | memory extractor 使用的模型或 endpoint id |
| `SILICONFLOW_API_KEY` | BGE-M3 embedding API Key（用于 memory build） |
| `DASHSCOPE_API_KEY` | Qwen reranker API Key（可选；缺失时跳过远程 rerank） |
| `VISION_MODEL` | 自定义视觉模型 ID |
| `CDP_HEADLESS=1` | 无头模式运行浏览器 |
| `CDP_USER_DATA_DIR` | 自定义 Chrome 用户数据目录 |
| `STRICT_CAPTURE=0` | 禁用严格捕获质量门控 |
| `WITH_IMAGES=1` | 启用图像 OCR/丰富化 |
| `MAX_IMAGE_SCREENSHOTS` | 限制截图数量（大会话提速） |
| `TAB_INDEX` | 指定标签页索引（URL 匹配失败时） |
| `HF_ENDPOINT=https://hf-mirror.com` | HuggingFace 镜像地址 (已在代码中内置) |

## 输出文件说明
- `transcript.txt` / `transcript.md` - 主要的继续对话产物（推荐）
- `session.raw.ndjson` - 原始归一化 turn 记录
- `images.enriched.jsonl` - 图像 OCR/摘要（可选）
- `state_snapshot.json` - 压缩后的稳定状态快照
- `preserved_tail.ndjson` - 保留的原始尾部上下文
- `handoff.md` / `resume_prompt.md` - 备用交接文档

## 记忆系统输出 (memory/)
- `persona.json` - 用户画像
- `events.ndjson` - 时间线事件
- `chroma/` - ChromaDB 向量库 (~78MB)
- `chunks_meta.json` - 分块元数据

## 开发注意事项
- AI Studio DOM 可能变化，提取器使用启发式选择器+回退策略
- 长会话使用逐 turn 水化循环，而非信任最终 DOM 快照（虚拟滚动问题）
- 默认路径是 `transcript.txt`/`transcript.md`，压缩是备用方案
- 图像提取是尽力而为，失败会记录但不致命
- 验证导出完整性时，检查 `transcript.txt` 或 `session.raw.ndjson` 的尾部时间戳，不要只依赖 turnCount
- **Python 环境**：强制使用全局虚拟环境 `~/.venv/ml` (Python 3.13+)，通过 `uv` 管理依赖。
- **代理处理**：Python 代码 (cli.py/extractor.py) 已自动清除 `all_proxy` 以防 httpx 报错，无需手动操作。
- **密钥处理**：不得在源码、handoff 或文档中写入实际 API key；只记录环境变量名。
- **隐私产物**：`memory/`、`.claude/handoffs/` 和 `memory-system/.claude/handoffs/` 是本地记忆/交接材料，默认不提交。

## Claude Code 自动化
- `/aistudio-export-text "<url>"`：按默认纯文本路径导出 AI Studio transcript，验证尾部，不自动压缩或刷新 memory。
- `/memory-workflow "<query>"`：统一入口；按任务选择 `memory:doctor/build/query/prompt/eval`，并在事实查询时优先检查 exact hit 与 rerank 状态。
- `/memory-prompt "<query>"`：兼容别名；只在明确需要格式化 prompt 时使用。
- `/fix-chrome-locks`：清理 `google-chrome-unstable` 残留进程和锁文件，只在 CDP/Profile 锁问题时使用。
- `transcript-validator` 子代理：验证 `session.raw.ndjson` 顺序、尾部时间戳和导出完整性。
- `rag-tuner` 子代理：调试分块、embedding 模型和混合检索召回质量。
- `.claude/settings.json` 配置了 lint hook 和本地隐私产物/敏感配置修改提醒；hook 不等于验证，提交前仍要手动运行 `bun run lint` 和相关测试。

## Handoff 状态
- 当前有效链路：`.claude/handoffs/2026-04-13-164536-memory-system-key-and-rag-ready.md` 继续自 `.claude/handoffs/2026-04-13-005907-memory-system-upgrade-and-automation.md` 和 `memory-system/.claude/handoffs/2026-04-12-personal-memory-system-rag.md`。
- 旧的 `memory-system/.claude/handoffs/2026-04-11-235403-personal-memory-system-rag.md` 是 Part 1，已由 Part 2 延续。
- 恢复任务时优先读最新 handoff，再回溯链路；不要依赖只含 TODO 的模板文件。

## 常见问题与解决方案

### Chrome 浏览器锁文件问题
**问题**：Chrome 进程残留或异常退出导致 `SingletonLock` 或数据库锁文件存在，无法启动新实例
**解决方案**：
```bash
# 杀死所有 Chrome 进程
pkill -f "google-chrome-unstable"

# 清理所有锁文件
find ~/.config/google-chrome-unstable -name "LOCK" -o -name "SingletonLock" | xargs rm -f
```

### 浏览器认证问题
**问题**：从磁盘 profile 启动的浏览器无法保留登录状态，跳转到 Google 登录页
**解决方案**：
1. 优先使用克隆的 profile 进行操作，避免影响主浏览器状态
2. 或者手动启动浏览器登录后再连接 CDP：
```bash
/opt/google/chrome-unstable/chrome --remote-debugging-port=9222 --user-data-dir=/tmp/cloned-profile
```

### CDP 连接问题
**问题**：浏览器启动了但无法连接到 9222 端口
**解决方案**：
1. 确保没有其他进程占用 9222 端口：`lsof -i :9222`
2. 使用 `--no-first-run --no-default-browser-check` 参数启动
3. 检查浏览器日志确认远程调试功能是否启用成功

### 无头模式问题
**问题**：无头模式下导出失败或认证失效
**解决方案**：
优先使用 headed 模式导出，尤其是需要用户交互登录的场景。无头模式适合已经保存了有效登录态的 profile。
