import { Command } from "commander";

import { collectMemoryDoctorReport, renderMemoryDoctorReport, type MemoryDoctorMode } from "../lib/memory/doctor.js";

export function createMemoryDoctorCommand(write: (message: string) => void = console.log): Command {
  return new Command("memory:doctor")
    .description("检查个人记忆系统运行环境")
    .option("-d, --memory-dir <dir>", "记忆目录", "memory/")
    .option("--memory-system-dir <dir>", "Python memory-system 目录")
    .option("--python-bin <path>", "Python 解释器路径")
    .option("--mode <mode>", "检查场景：build 或 query", "query")
    .action((options: { memoryDir: string; memorySystemDir?: string; mode: string; pythonBin?: string }) => {
      const mode: MemoryDoctorMode = options.mode === "build" ? "build" : "query";
      const report = collectMemoryDoctorReport({
        memoryDir: options.memoryDir,
        memorySystemDir: options.memorySystemDir,
        mode,
        pythonBin: options.pythonBin,
      });

      write(renderMemoryDoctorReport(report));
      if (!report.ready) {
        process.exitCode = 1;
      }
    });
}

export const memoryDoctorCommand = createMemoryDoctorCommand();
