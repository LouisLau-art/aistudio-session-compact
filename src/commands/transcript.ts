import path from "node:path";

import { readNdjson, writeJson, writeText } from "../lib/fs.js";
import { renderTranscriptMarkdown, renderTranscriptText } from "../lib/transcript.js";
import type { ImageEnrichment, SessionTurn } from "../types.js";

export interface TranscriptOptions {
  rawPath: string;
  imagesPath?: string;
  outDir: string;
}

export interface TranscriptResult {
  transcriptTxtPath: string;
  transcriptMdPath: string;
  reportPath: string;
  turnCount: number;
}

export async function runTranscript(options: TranscriptOptions): Promise<TranscriptResult> {
  const turns = await readNdjson<SessionTurn>(options.rawPath);
  const images = options.imagesPath ? await readNdjson<ImageEnrichment>(options.imagesPath) : [];

  const transcriptTxtPath = path.join(options.outDir, "transcript.txt");
  const transcriptMdPath = path.join(options.outDir, "transcript.md");
  const reportPath = path.join(options.outDir, "transcript.report.json");

  await writeText(transcriptTxtPath, renderTranscriptText(turns, images));
  await writeText(transcriptMdPath, renderTranscriptMarkdown(turns, images));
  await writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    rawPath: options.rawPath,
    imagesPath: options.imagesPath,
    transcriptTxtPath,
    transcriptMdPath,
    turnCount: turns.length,
  });

  return {
    transcriptTxtPath,
    transcriptMdPath,
    reportPath,
    turnCount: turns.length,
  };
}
