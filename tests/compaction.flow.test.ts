import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCompress } from "../src/commands/compress.js";
import { readNdjson } from "../src/lib/fs.js";
import type { SessionTurn, StateSnapshot } from "../src/types.js";

describe("runCompress v2", () => {
  it("writes snapshot, preserved tail, and report artifacts without requiring image enrichment", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "compress-v2-"));
    const briefingPath = path.join(outDir, "story_briefing.json");

    await writeFile(
      briefingPath,
      JSON.stringify(
        {
          background: {
            summary: "The user is trying to continue a long-running relationship analysis.",
            emotionalContext: ["pain"],
            workingFrames: ["NPD"],
          },
          peopleMap: [{ name: "何引", relation: "Central person in the story" }],
          stableFacts: ["The user met 何引 on 2026-01-14."],
          timelineAnchors: ["2026-01-14: first meeting"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runCompress({
      rawPath: path.resolve("examples/sample.raw.ndjson"),
      briefingPath,
      outDir,
      tailCharsBudget: 40,
      minTailTurns: 1,
      maxTailTurns: 5,
    });

    const snapshot = JSON.parse(await readFile(result.snapshotPath, "utf8")) as StateSnapshot;
    const tail = await readNdjson<SessionTurn>(result.tailPath);
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
      rawPath: string;
      imagesPath?: string;
      snapshotPath: string;
      tailPath: string;
      turnCount: number;
      tailTurnCount: number;
      briefingApplied: boolean;
      warnings: string[];
    };

    expect(result.snapshotPath).toBe(path.join(outDir, "state_snapshot.json"));
    expect(result.tailPath).toBe(path.join(outDir, "preserved_tail.ndjson"));
    expect(result.reportPath).toBe(path.join(outDir, "compress.report.json"));

    expect(snapshot.version).toBe(2);
    expect(snapshot.briefing.applied).toBe(true);
    expect(snapshot.stableFacts).toContain("The user met 何引 on 2026-01-14.");

    expect(tail.length).toBeGreaterThan(0);

    expect(report.rawPath).toBe(path.resolve("examples/sample.raw.ndjson"));
    expect(report.imagesPath).toBeUndefined();
    expect(report.snapshotPath).toBe(result.snapshotPath);
    expect(report.tailPath).toBe(result.tailPath);
    expect(report.turnCount).toBe(2);
    expect(report.tailTurnCount).toBe(tail.length);
    expect(report.briefingApplied).toBe(true);
    expect(Array.isArray(report.warnings)).toBe(true);
  });
});
