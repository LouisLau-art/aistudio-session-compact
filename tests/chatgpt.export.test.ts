import { mkdtemp, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  extractChatgptConversationId,
  normalizeChatgptConversation,
  runExportChatgpt,
  selectChatgptCdpTarget,
} from "../src/commands/exportChatgpt.js";

const sampleConversation = {
  id: "69f76185-7c84-83a9-946e-e73fd0c877a4",
  title: "ChatGPT export demo",
  create_time: 1760000000,
  update_time: 1760000300,
  current_node: "assistant-2",
  mapping: {
    root: {
      id: "root",
      children: ["system-1"],
    },
    "system-1": {
      id: "system-1",
      parent: "root",
      children: ["user-1"],
      message: {
        id: "system-1",
        author: { role: "system" },
        content: { content_type: "text", parts: ["internal setup"] },
        recipient: "all",
      },
    },
    "user-1": {
      id: "user-1",
      parent: "system-1",
      children: ["assistant-1"],
      message: {
        id: "user-1",
        author: { role: "user" },
        content: { content_type: "text", parts: ["你好，帮我总结这段经历"] },
        recipient: "all",
      },
    },
    "assistant-1": {
      id: "assistant-1",
      parent: "user-1",
      children: ["tool-1"],
      message: {
        id: "assistant-1",
        author: { role: "assistant" },
        content: { content_type: "text", parts: ["可以，我先梳理事实。"] },
        recipient: "all",
        metadata: { model_slug: "gpt-5-2" },
      },
    },
    "tool-1": {
      id: "tool-1",
      parent: "assistant-1",
      children: ["assistant-2"],
      message: {
        id: "tool-1",
        author: { role: "tool", name: "browser" },
        content: { content_type: "text", parts: ["hidden tool output"] },
        recipient: "assistant",
      },
    },
    "assistant-2": {
      id: "assistant-2",
      parent: "tool-1",
      children: [],
      message: {
        id: "assistant-2",
        author: { role: "assistant" },
        content: { content_type: "text", parts: ["这是最终总结。"] },
        recipient: "all",
        metadata: { model_slug: "gpt-5-2" },
      },
    },
  },
};

describe("ChatGPT conversation export", () => {
  it("extracts conversation ids from ChatGPT conversation URLs", () => {
    expect(extractChatgptConversationId("https://chatgpt.com/c/69f76185-7c84-83a9-946e-e73fd0c877a4")).toBe(
      "69f76185-7c84-83a9-946e-e73fd0c877a4",
    );
    expect(extractChatgptConversationId("https://chat.openai.com/c/abc?model=gpt-5")).toBe("abc");
  });

  it("normalizes ChatGPT mapping JSON into ordered session turns", () => {
    const turns = normalizeChatgptConversation(sampleConversation, "https://chatgpt.com/c/69f76185-7c84-83a9-946e-e73fd0c877a4");

    expect(turns).toHaveLength(3);
    expect(turns.map((turn) => turn.role)).toEqual(["user", "model", "model"]);
    expect(turns.map((turn) => turn.text)).toEqual(["你好，帮我总结这段经历", "可以，我先梳理事实。", "这是最终总结。"]);
    expect(turns[0].id).toBe("t-000001");
    expect(turns[0].sourceUrl).toBe("https://chatgpt.com/c/69f76185-7c84-83a9-946e-e73fd0c877a4");
    expect(turns.every((turn) => turn.images.length === 0)).toBe(true);
  });

  it("writes raw turns, transcript artifacts, and an export report", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "chatgpt-export-"));
    const runTranscript = vi.fn(async () => ({
      transcriptTxtPath: path.join(outDir, "transcript.txt"),
      transcriptMdPath: path.join(outDir, "transcript.md"),
      reportPath: path.join(outDir, "transcript.report.json"),
      turnCount: 3,
    }));

    const result = await runExportChatgpt(
      {
        outDir,
        cdpUrl: "http://127.0.0.1:9222",
        urlMatch: "chatgpt.com/c/",
        conversationUrl: "https://chatgpt.com/c/69f76185-7c84-83a9-946e-e73fd0c877a4",
      },
      {
        fetchConversation: async () => sampleConversation,
        runTranscript,
      },
    );

    const raw = await readFile(result.rawPath, "utf8");
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
      provider: string;
      conversationId: string;
      sourceUrl: string;
      rawPath: string;
      turnCount: number;
    };

    expect(raw).toContain("\"role\":\"user\"");
    expect(raw).toContain("这是最终总结");
    expect(runTranscript).toHaveBeenCalledWith({
      rawPath: result.rawPath,
      outDir,
    });
    expect(report.provider).toBe("chatgpt");
    expect(report.conversationId).toBe("69f76185-7c84-83a9-946e-e73fd0c877a4");
    expect(report.sourceUrl).toBe("https://chatgpt.com/c/69f76185-7c84-83a9-946e-e73fd0c877a4");
    expect(report.rawPath).toBe(result.rawPath);
    expect(report.turnCount).toBe(3);
  });

  it("exposes an export-chatgpt CLI command", () => {
    const result = spawnSync("bun", ["run", "src/cli.ts", "--help"], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("export-chatgpt");
  });

  it("selects ChatGPT page targets from raw CDP target lists", () => {
    const targets = [
      { type: "background_page", url: "chrome-extension://demo/background.html", webSocketDebuggerUrl: "ws://background" },
      { type: "page", url: "https://example.com/", webSocketDebuggerUrl: "ws://example" },
      {
        type: "page",
        url: "https://chatgpt.com/c/69f76185-7c84-83a9-946e-e73fd0c877a4",
        webSocketDebuggerUrl: "ws://chatgpt",
      },
    ];

    expect(selectChatgptCdpTarget(targets, "chatgpt.com/c/")?.webSocketDebuggerUrl).toBe("ws://chatgpt");
    expect(selectChatgptCdpTarget(targets, "", 1)?.webSocketDebuggerUrl).toBe("ws://chatgpt");
  });
});
