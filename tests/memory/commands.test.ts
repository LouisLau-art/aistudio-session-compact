import path from "node:path";

import { describe, expect, test, vi } from "vitest";

import { createMemoryBuildCommand } from "../../src/commands/memory-build.js";
import { createMemoryEvalCommand } from "../../src/commands/memory-eval.js";
import { createMemoryPromptCommand } from "../../src/commands/memory-prompt.js";
import { createMemoryQueryCommand } from "../../src/commands/memory-query.js";

describe("memory CLI bridge commands", () => {
  test("memory:build preflights and delegates to the Python build command with absolute paths", async () => {
    const runMemoryCli = vi.fn(async () => undefined);
    const preflight = vi.fn(() => true);
    const command = createMemoryBuildCommand(runMemoryCli, preflight);

    await command.parseAsync([
      "--input",
      "out",
      "--catalog",
      "~/internship-jd-catalog",
      "--output",
      "memory",
    ], { from: "user" });

    expect(preflight).toHaveBeenCalledWith({
      mode: "build",
      memoryDir: path.resolve("memory"),
    });
    expect(runMemoryCli).toHaveBeenCalledWith([
      "build",
      "--input",
      path.resolve("out"),
      "--catalog",
      "~/internship-jd-catalog",
      "--output",
      path.resolve("memory"),
    ]);
  });

  test("memory:build forwards sessions-only and rebuild flags", async () => {
    const runMemoryCli = vi.fn(async () => undefined);
    const preflight = vi.fn(() => true);
    const command = createMemoryBuildCommand(runMemoryCli, preflight);

    await command.parseAsync([
      "--input",
      "out",
      "--output",
      "memory",
      "--sessions-only",
      "--rebuild",
    ], { from: "user" });

    expect(runMemoryCli).toHaveBeenCalledWith(expect.arrayContaining([
      "--sessions-only",
      "--rebuild",
    ]));
  });

  test("memory:query preflights and delegates to the Python query command", async () => {
    const runMemoryCli = vi.fn(async () => undefined);
    const preflight = vi.fn(() => true);
    const command = createMemoryQueryCommand(runMemoryCli, preflight);

    await command.parseAsync([
      "用户教育背景",
      "--memory-dir",
      "memory",
    ], { from: "user" });

    expect(preflight).toHaveBeenCalledWith({
      mode: "query",
      memoryDir: path.resolve("memory"),
    });
    expect(runMemoryCli).toHaveBeenCalledWith([
      "query",
      "用户教育背景",
      "--memory-dir",
      path.resolve("memory"),
    ]);
  });

  test("memory:query stops before Python when preflight fails", async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;

    try {
      const runMemoryCli = vi.fn(async () => undefined);
      const preflight = vi.fn(() => false);
      const command = createMemoryQueryCommand(runMemoryCli, preflight);

      await command.parseAsync(["用户教育背景"], { from: "user" });

      expect(runMemoryCli).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode ?? 0;
    }
  });

  test("memory:prompt preflights and delegates to the Python prompt command", async () => {
    const runMemoryCli = vi.fn(async () => undefined);
    const preflight = vi.fn(() => true);
    const command = createMemoryPromptCommand(runMemoryCli, preflight);

    await command.parseAsync([
      "京东职位要求",
      "--memory-dir",
      "memory",
      "--top-k",
      "8",
    ], { from: "user" });

    expect(preflight).toHaveBeenCalledWith({
      mode: "query",
      memoryDir: path.resolve("memory"),
    });
    expect(runMemoryCli).toHaveBeenCalledWith([
      "prompt",
      "京东职位要求",
      "--memory-dir",
      path.resolve("memory"),
      "--top-k",
      "8",
    ]);
  });

  test("memory:eval preflights and delegates to the Python eval command", async () => {
    const runMemoryCli = vi.fn(async () => undefined);
    const preflight = vi.fn(() => true);
    const command = createMemoryEvalCommand(runMemoryCli, preflight);

    await command.parseAsync([
      "--memory-dir",
      "memory",
      "--cases",
      "memory/evals/personal.json",
      "--top-k",
      "8",
    ], { from: "user" });

    expect(preflight).toHaveBeenCalledWith({
      mode: "query",
      memoryDir: path.resolve("memory"),
    });
    expect(runMemoryCli).toHaveBeenCalledWith([
      "eval",
      "--memory-dir",
      path.resolve("memory"),
      "--cases",
      path.resolve("memory/evals/personal.json"),
      "--top-k",
      "8",
    ]);
  });
});
