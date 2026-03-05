import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runTesseractOcr(imagePath: string, lang: string): Promise<string> {
  const args = [imagePath, "stdout", "-l", lang, "--psm", "6"];

  const { stdout } = await execFileAsync("tesseract", args, {
    maxBuffer: 8 * 1024 * 1024,
  });

  return stdout.replace(/\s+/g, " ").trim();
}
