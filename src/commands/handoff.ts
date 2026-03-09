import { readFile } from "node:fs/promises";
import path from "node:path";

import { applyBriefingToSnapshot, readBriefingFile } from "../lib/briefing.js";
import { ensureDir, readNdjson, writeText } from "../lib/fs.js";
import {
  renderHandoffMarkdown,
  renderPreservedTailMarkdown,
  renderPreservedTailText,
  renderResumePrompt,
} from "../lib/render.js";
import type { SessionTurn, StateSnapshot } from "../types.js";

export interface HandoffOptions {
  snapshotPath: string;
  tailPath: string;
  briefingPath?: string;
  outDir: string;
}

export async function runHandoff(options: HandoffOptions): Promise<{
  handoffPath: string;
  resumePromptPath: string;
  preservedTailMarkdownPath: string;
  preservedTailTextPath: string;
}> {
  const outDir = path.resolve(options.outDir);
  await ensureDir(outDir);

  const rawSnapshot = JSON.parse(await readFile(options.snapshotPath, "utf8")) as StateSnapshot;
  const tail = await readNdjson<SessionTurn>(options.tailPath);
  const briefing = options.briefingPath ? await readBriefingFile(options.briefingPath) : undefined;
  const snapshot = applyBriefingToSnapshot(rawSnapshot, briefing);

  const handoffPath = path.join(outDir, "handoff.md");
  const resumePromptPath = path.join(outDir, "resume_prompt.md");
  const preservedTailMarkdownPath = path.join(outDir, "preserved_tail.md");
  const preservedTailTextPath = path.join(outDir, "preserved_tail.txt");

  await writeText(handoffPath, renderHandoffMarkdown(snapshot, tail));
  await writeText(resumePromptPath, renderResumePrompt(snapshot, tail));
  await writeText(preservedTailMarkdownPath, renderPreservedTailMarkdown(tail));
  await writeText(preservedTailTextPath, renderPreservedTailText(tail));

  return { handoffPath, resumePromptPath, preservedTailMarkdownPath, preservedTailTextPath };
}
