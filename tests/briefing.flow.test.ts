import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCompress } from "../src/commands/compress.js";
import { runHandoff } from "../src/commands/handoff.js";

describe("briefing flow", () => {
  it("threads briefing data through compress and handoff", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "briefing-flow-"));

    const compress = await runCompress({
      rawPath: path.resolve("examples/sample.raw.ndjson"),
      briefingPath: path.resolve("examples/sample.briefing.json"),
      outDir,
      minTailTurns: 1,
      maxTailTurns: 10,
      tailCharsBudget: 200,
    });

    const handoff = await runHandoff({
      snapshotPath: compress.snapshotPath,
      tailPath: compress.tailPath,
      briefingPath: path.resolve("examples/sample.briefing.json"),
      outDir,
    });

    const resumePrompt = await readFile(handoff.resumePromptPath, "utf8");
    expect(resumePrompt).toContain("## Stable Background");
    expect(resumePrompt).toContain("psychoanalytic framing");
    expect(resumePrompt).toContain("## People Map");
    expect(resumePrompt).toContain("Primary person");
    expect(resumePrompt).toContain("Roommate");
  });
});
