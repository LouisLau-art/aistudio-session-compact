import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface MemoryCliInvocation {
  pythonBin: string;
  args: string[];
  cwd: string;
}

export interface MemoryCliOptions {
  env?: NodeJS.ProcessEnv;
  memorySystemDir?: string;
  pythonBin?: string;
}

export type RunMemoryCli = (args: string[]) => Promise<void>;

export function createMemoryCliInvocation(
  args: string[],
  options: MemoryCliOptions = {},
): MemoryCliInvocation {
  const env = options.env ?? process.env;
  const memorySystemDir = path.resolve(options.memorySystemDir ?? env.MEMORY_SYSTEM_DIR ?? "memory-system");
  const defaultPython = path.join(os.homedir(), ".venv", "ml", "bin", "python");
  const pythonBin = options.pythonBin
    ?? env.MEMORY_PYTHON
    ?? (existsSync(defaultPython) ? defaultPython : "python3");

  return {
    pythonBin,
    args: ["-m", "src.cli", ...args],
    cwd: memorySystemDir,
  };
}

export async function runMemoryCli(args: string[], options: MemoryCliOptions = {}): Promise<void> {
  const invocation = createMemoryCliInvocation(args, options);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(invocation.pythonBin, invocation.args, {
      cwd: invocation.cwd,
      env: options.env ?? process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`memory-system command failed with exit code ${code ?? "unknown"}`));
    });
  });
}
