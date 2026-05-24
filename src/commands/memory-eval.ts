import { Command } from "commander";
import path from "node:path";

import { runMemoryCli, type RunMemoryCli } from "../lib/memory/python-cli.js";
import { runMemoryPreflight, type MemoryCommandPreflight } from "../lib/memory/preflight.js";

export function createMemoryEvalCommand(
  run: RunMemoryCli = runMemoryCli,
  preflight: MemoryCommandPreflight = runMemoryPreflight,
): Command {
  return new Command("memory:eval")
    .description("运行个人记忆检索回归评估")
    .requiredOption("--cases <path>", "golden eval cases JSON 文件")
    .option("-d, --memory-dir <dir>", "记忆目录", "memory/")
    .option("-k, --top-k <n>", "每个问题检索的 RAG 数量", "5")
    .action(async (options: { cases: string; memoryDir: string; topK: string }) => {
      const memoryDir = path.resolve(options.memoryDir);
      if (!preflight({ mode: "query", memoryDir })) {
        process.exitCode = 1;
        return;
      }

      await run([
        "eval",
        "--memory-dir",
        memoryDir,
        "--cases",
        path.resolve(options.cases),
        "--top-k",
        options.topK,
      ]);
    });
}

export const memoryEvalCommand = createMemoryEvalCommand();
