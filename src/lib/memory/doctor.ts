import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type MemoryDoctorStatus = "ok" | "missing" | "warning";

export interface MemoryDoctorCheck {
  name: string;
  state: "OK" | "SET" | "MISSING";
  status: MemoryDoctorStatus;
  required: boolean;
  detail: string;
}

export type MemoryDoctorMode = "build" | "query";

export interface MemoryDoctorReport {
  mode: MemoryDoctorMode;
  ready: boolean;
  checks: MemoryDoctorCheck[];
}

export interface MemoryDoctorOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  exists?: (targetPath: string) => boolean;
  homeDir?: string;
  memoryDir?: string;
  memorySystemDir?: string;
  mode?: MemoryDoctorMode;
  pythonBin?: string;
}

export function collectMemoryDoctorReport(options: MemoryDoctorOptions = {}): MemoryDoctorReport {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const homeDir = options.homeDir ?? os.homedir();
  const mode = options.mode ?? "query";

  const memorySystemDir = resolvePath(
    options.memorySystemDir ?? env.MEMORY_SYSTEM_DIR ?? "memory-system",
    cwd,
    homeDir,
  );
  const memoryDir = resolvePath(options.memoryDir ?? "memory", cwd, homeDir);
  const defaultPython = path.join(homeDir, ".venv", "ml", "bin", "python");
  const pythonBin = options.pythonBin
    ?? env.MEMORY_PYTHON
    ?? (exists(defaultPython) ? defaultPython : "python3");

  const chromaPath = path.join(memoryDir, "chroma");
  const checks: MemoryDoctorCheck[] = [
    checkPath("Python", pythonBin, pythonBin === "python3" || exists(pythonBin), true),
    checkPath("memory-system", memorySystemDir, exists(memorySystemDir), true),
    checkPath("memory-system/src/cli.py", path.join(memorySystemDir, "src", "cli.py"), exists(path.join(memorySystemDir, "src", "cli.py")), true),
    checkPath(
      "memory/chroma",
      chromaPath,
      exists(chromaPath),
      mode === "query",
      mode === "build" ? `${chromaPath}; will be created by memory:build` : undefined,
    ),
    checkEnv("SILICONFLOW_API_KEY", Boolean(env.SILICONFLOW_API_KEY), true, "required for build/query embeddings"),
    checkEnv("LLM_API_KEY or ARK_API_KEY", Boolean(env.LLM_API_KEY || env.ARK_API_KEY), false, "optional enrichment for persona/events extraction during build"),
    checkEnv("DASHSCOPE_API_KEY", Boolean(env.DASHSCOPE_API_KEY), false, "optional reranker; missing means vector search only"),
  ];

  return {
    mode,
    ready: checks.every(check => !check.required || check.status === "ok"),
    checks,
  };
}

export function renderMemoryDoctorReport(report: MemoryDoctorReport): string {
  const lines = [`Memory doctor (${report.mode})`];

  for (const check of report.checks) {
    const icon = check.status === "ok" ? "[OK]" : check.required ? "[MISSING]" : "[WARN]";
    lines.push(`${icon} ${check.name}: ${check.state} - ${check.detail}`);
  }

  lines.push(`Result: ${report.ready ? "READY" : "NOT READY"}`);
  return lines.join("\n");
}

function checkPath(
  name: string,
  targetPath: string,
  present: boolean,
  required: boolean,
  detail = targetPath,
): MemoryDoctorCheck {
  return {
    name,
    state: present ? "OK" : "MISSING",
    status: present ? "ok" : required ? "missing" : "warning",
    required,
    detail,
  };
}

function checkEnv(name: string, present: boolean, required: boolean, detail: string): MemoryDoctorCheck {
  return {
    name,
    state: present ? "SET" : "MISSING",
    status: present ? "ok" : required ? "missing" : "warning",
    required,
    detail,
  };
}

function resolvePath(inputPath: string, cwd: string, homeDir: string): string {
  const expanded = inputPath.startsWith("~/")
    ? path.join(homeDir, inputPath.slice(2))
    : inputPath;
  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
}
