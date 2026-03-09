import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runTranscript } from "../src/commands/transcript.js";
import { renderTranscriptMarkdown, renderTranscriptText } from "../src/lib/transcript.js";
import type { ImageEnrichment, SessionTurn } from "../src/types.js";

const turns: SessionTurn[] = [
  {
    id: "t-000001",
    order: 1,
    role: "user",
    text: "Met her on January 14.",
    sourceUrl: "https://aistudio.google.com/prompts/example",
    images: [],
  },
  {
    id: "t-000002",
    order: 2,
    role: "model",
    text: "What happened after that?",
    sourceUrl: "https://aistudio.google.com/prompts/example",
    images: [{ id: "img-1", messageId: "t-000002", src: "local://img-1", index: 0 }],
  },
  {
    id: "t-000003",
    order: 3,
    role: "user",
    text: "I told Gemini about the rejection.",
    sourceUrl: "https://aistudio.google.com/prompts/example",
    images: [{ id: "img-2", messageId: "t-000003", src: "local://img-2", index: 0 }],
  },
];

const enrichments: ImageEnrichment[] = [
  {
    imageId: "img-1",
    messageId: "t-000002",
    src: "local://img-1",
    status: "ok",
    ocrText: "Screenshot text from the conversation",
  },
  {
    imageId: "img-2",
    messageId: "t-000003",
    src: "local://img-2",
    status: "skipped",
    error: "image file missing from capture stage",
  },
];

describe("transcript renderers", () => {
  it("renders plain text in turn order with explicit role labels", () => {
    const text = renderTranscriptText([turns[1]!, turns[0]!, turns[2]!], enrichments);

    expect(text).toContain("[1] USER t-000001");
    expect(text).toContain("[2] MODEL t-000002");
    expect(text).toContain("[3] USER t-000003");

    expect(text.indexOf("[1] USER t-000001")).toBeLessThan(text.indexOf("[2] MODEL t-000002"));
    expect(text.indexOf("[2] MODEL t-000002")).toBeLessThan(text.indexOf("[3] USER t-000003"));
  });

  it("renders readable markdown sections per turn", () => {
    const markdown = renderTranscriptMarkdown(turns, enrichments);

    expect(markdown).toContain("# Session Transcript");
    expect(markdown).toContain("## [1] User `t-000001`");
    expect(markdown).toContain("## [2] Model `t-000002`");
    expect(markdown).toContain("Met her on January 14.");
    expect(markdown).toContain("What happened after that?");
  });

  it("appends OCR snippets only for successful enrichments with content", () => {
    const text = renderTranscriptText(turns, enrichments);

    expect(text).toContain("[Image img-1] OCR: Screenshot text from the conversation");
    expect(text).not.toContain("[Image img-2]");
    expect(text).not.toContain("image file missing from capture stage");
  });
});

describe("runTranscript", () => {
  it("writes transcript text, markdown, and report artifacts", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "transcript-run-"));

    const result = await runTranscript({
      rawPath: path.resolve("examples/sample.raw.ndjson"),
      outDir,
    });

    const text = await readFile(result.transcriptTxtPath, "utf8");
    const markdown = await readFile(result.transcriptMdPath, "utf8");
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
      rawPath: string;
      transcriptTxtPath: string;
      transcriptMdPath: string;
      turnCount: number;
    };

    expect(text).toContain("[0] USER t-000001");
    expect(markdown).toContain("# Session Transcript");
    expect(report.rawPath).toBe(path.resolve("examples/sample.raw.ndjson"));
    expect(report.transcriptTxtPath).toBe(result.transcriptTxtPath);
    expect(report.transcriptMdPath).toBe(result.transcriptMdPath);
    expect(report.turnCount).toBe(2);
  });
});
