import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const paddleScriptPath = path.resolve(fileURLToPath(new URL("../../scripts/paddle_ocr.py", import.meta.url)));

export type OcrEngine = "auto" | "tesseract" | "paddle";
export type ResolvedOcrEngine = "tesseract" | "paddle" | "none";

export function selectOcrEngine(input: {
  requested: OcrEngine;
  paddleAvailable: boolean;
  tesseractAvailable: boolean;
}): ResolvedOcrEngine {
  if (input.requested === "paddle") {
    if (input.paddleAvailable) return "paddle";
    if (input.tesseractAvailable) return "tesseract";
    return "none";
  }

  if (input.requested === "tesseract") {
    if (input.tesseractAvailable) return "tesseract";
    if (input.paddleAvailable) return "paddle";
    return "none";
  }

  if (input.paddleAvailable) return "paddle";
  if (input.tesseractAvailable) return "tesseract";
  return "none";
}

export async function resolveOcrEngine(requested: OcrEngine, pythonBin: string): Promise<ResolvedOcrEngine> {
  const [paddleAvailable, tesseractAvailable] = await Promise.all([
    isPaddleOcrAvailable(pythonBin),
    isTesseractAvailable(),
  ]);

  return selectOcrEngine({
    requested,
    paddleAvailable,
    tesseractAvailable,
  });
}

export async function isPaddleOcrAvailable(pythonBin: string): Promise<boolean> {
  try {
    await execFileAsync(
      pythonBin,
      ["-c", "import paddleocr; print('ok')"],
      {
        timeout: 12000,
        maxBuffer: 1024 * 1024,
      },
    );
    return true;
  } catch {
    return false;
  }
}

export async function isTesseractAvailable(): Promise<boolean> {
  try {
    await execFileAsync("tesseract", ["--version"], {
      timeout: 8000,
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

export async function runTesseractOcr(imagePath: string, lang: string): Promise<string> {
  const args = [imagePath, "stdout", "-l", lang, "--psm", "6"];

  const { stdout } = await execFileAsync("tesseract", args, {
    maxBuffer: 8 * 1024 * 1024,
  });

  return stdout.replace(/\s+/g, " ").trim();
}

export async function runPaddleOcr(imagePath: string, lang: string, pythonBin: string): Promise<string> {
  const mappedLang = mapToPaddleLang(lang);
  const args = [paddleScriptPath, "--image", imagePath, "--lang", mappedLang];
  const { stdout } = await execFileAsync(pythonBin, args, {
    maxBuffer: 8 * 1024 * 1024,
  });

  const parsed = JSON.parse(stdout) as Partial<{ text: string }>;
  return (parsed.text ?? "").replace(/\s+/g, " ").trim();
}

function mapToPaddleLang(lang: string): string {
  const lower = lang.toLowerCase();
  if (lower.includes("chi") || lower.includes("ch")) return "ch";
  if (lower.includes("eng") || lower.includes("en")) return "en";
  return "en";
}
