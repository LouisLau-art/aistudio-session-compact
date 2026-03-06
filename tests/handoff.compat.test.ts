import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runHandoff } from "../src/commands/handoff.js";

describe("runHandoff compatibility", () => {
  it("renders legacy capsule JSON without crashing", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "handoff-compat-"));

    const result = await runHandoff({
      capsulePath: path.resolve("examples/sample.context_capsule.json"),
      outDir,
    });

    const handoff = await readFile(result.handoffPath, "utf8");
    const resumePrompt = await readFile(result.resumePromptPath, "utf8");

    expect(handoff).toContain("## Current State");
    expect(handoff).toContain("## Stable Decisions");
    expect(handoff).toContain("## Active Facts");
    expect(handoff).toContain("用户在AI Studio中进行长会话");
    expect(resumePrompt).toContain("## Current State");
  });
});
