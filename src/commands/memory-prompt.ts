import { Command } from "commander";
import path from "node:path";

import { runMemoryCli, type RunMemoryCli } from "../lib/memory/python-cli.js";
import { runMemoryPreflight, type MemoryCommandPreflight } from "../lib/memory/preflight.js";

export function createMemoryPromptCommand(
  run: RunMemoryCli = runMemoryCli,
  preflight: MemoryCommandPreflight = runMemoryPreflight,
): Command {
  return new Command("memory:prompt")
    .description("生成给新 Agent 的记忆上下文")
    .argument("<query>", "查询内容")
    .option("-d, --memory-dir <dir>", "记忆目录", "memory/")
    .option("-k, --top-k <n>", "RAG 数量", "5")
    .action(async (query: string, options: { memoryDir: string; topK: string }) => {
      const memoryDir = path.resolve(options.memoryDir);
      if (!preflight({ mode: "query", memoryDir })) {
        process.exitCode = 1;
        return;
      }

      await run([
        "prompt",
        query,
        "--memory-dir",
        memoryDir,
        "--top-k",
        options.topK,
      ]);
    });
}

export const memoryPromptCommand = createMemoryPromptCommand();
