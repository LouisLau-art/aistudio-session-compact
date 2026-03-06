import { readFile } from "node:fs/promises";
import path from "node:path";

import { applyBriefing, readBriefingFile } from "../lib/briefing.js";
import { ensureDir, writeText } from "../lib/fs.js";
import { normalizeContextCapsule } from "../lib/capsule-schema.js";
import { renderHandoffMarkdown, renderResumePrompt } from "../lib/render.js";
import type { ContextCapsule } from "../types.js";

export interface HandoffOptions {
  capsulePath: string;
  briefingPath?: string;
  outDir: string;
}

export async function runHandoff(options: HandoffOptions): Promise<{
  handoffPath: string;
  resumePromptPath: string;
}> {
  const outDir = path.resolve(options.outDir);
  await ensureDir(outDir);

  const raw = await readFile(options.capsulePath, "utf8");
  const parsedCapsule = normalizeContextCapsule(JSON.parse(raw) as ContextCapsule);
  const briefing = options.briefingPath ? await readBriefingFile(options.briefingPath) : undefined;
  const capsule = applyBriefing(parsedCapsule, briefing);

  const handoffPath = path.join(outDir, "handoff.md");
  const resumePromptPath = path.join(outDir, "resume_prompt.md");

  await writeText(handoffPath, renderHandoffMarkdown(capsule));
  await writeText(resumePromptPath, renderResumePrompt(capsule));

  return { handoffPath, resumePromptPath };
}
