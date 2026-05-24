import { Command } from "commander";
import path from "node:path";

import { runMemoryCli, type RunMemoryCli } from "../lib/memory/python-cli.js";
import { runMemoryPreflight, type MemoryCommandPreflight } from "../lib/memory/preflight.js";

export function createMemoryQueryCommand(
  run: RunMemoryCli = runMemoryCli,
  preflight: MemoryCommandPreflight = runMemoryPreflight,
): Command {
  return new Command("memory:query")
    .description("查询记忆")
    .argument("<query>", "查询内容")
    .option("-d, --memory-dir <dir>", "记忆目录", "memory/")
    .action(async (query: string, options: { memoryDir: string }) => {
      const memoryDir = path.resolve(options.memoryDir);
      if (!preflight({ mode: "query", memoryDir })) {
        process.exitCode = 1;
        return;
      }

      await run([
        "query",
        query,
        "--memory-dir",
        memoryDir,
      ]);
    });
}

export const memoryQueryCommand = createMemoryQueryCommand();
