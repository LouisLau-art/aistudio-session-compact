import { Command } from "commander";
import path from "node:path";

import { runMemoryCli, type RunMemoryCli } from "../lib/memory/python-cli.js";
import { runMemoryPreflight, type MemoryCommandPreflight } from "../lib/memory/preflight.js";

export function createMemoryBuildCommand(
  run: RunMemoryCli = runMemoryCli,
  preflight: MemoryCommandPreflight = runMemoryPreflight,
): Command {
  return new Command("memory:build")
    .description("构建个人记忆索引")
    .option("-i, --input <dir>", "输入目录，包含 session 文件", "out/")
    .option("-c, --catalog <dir>", "实习文档目录", "~/internship-jd-catalog/")
    .option("-o, --output <dir>", "输出目录", "memory/")
    .option("--sessions-only", "只索引 AI Studio session，不加载外部 catalog")
    .option("--rebuild", "写入前清理已有 Chroma 索引")
    .action(async (options: { input: string; catalog: string; output: string; sessionsOnly?: boolean; rebuild?: boolean }) => {
      const outputDir = path.resolve(options.output);
      if (!preflight({ mode: "build", memoryDir: outputDir })) {
        process.exitCode = 1;
        return;
      }

      const args = [
        "build",
        "--input",
        path.resolve(options.input),
        "--catalog",
        options.catalog,
        "--output",
        outputDir,
      ];

      if (options.sessionsOnly) {
        args.push("--sessions-only");
      }
      if (options.rebuild) {
        args.push("--rebuild");
      }

      await run(args);
    });
}

export const memoryBuildCommand = createMemoryBuildCommand();
