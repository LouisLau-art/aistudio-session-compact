import { describe, expect, it } from "vitest";

import { assertCaptureQuality, normalizeBrowserTurns } from "../src/lib/extract.js";
import type { SessionTurn } from "../src/types.js";

describe("normalizeBrowserTurns", () => {
  it("maps role hints and image refs", () => {
    const turns = normalizeBrowserTurns(
      [
        {
          text: "You: Please summarize this thread",
          roleHint: "user",
          images: [{ src: "https://example.com/a.png" }],
        },
        {
          text: "Gemini: Here is a summary.",
          roleHint: "assistant",
          images: [],
        },
      ],
      "https://aistudio.google.com/prompts/test",
    );

    expect(turns).toHaveLength(2);
    expect(turns[0].role).toBe("user");
    expect(turns[1].role).toBe("model");
    expect(turns[0].images[0].id).toContain("img");
  });

  it("splits composite User/Model text and removes UI tokens", () => {
    const turns = normalizeBrowserTurns(
      [
        {
          text: "menu more_vert User hello there Model 5:27 PM sure, got it thumb_up",
          images: [],
        },
      ],
      "https://aistudio.google.com/prompts/test",
    );

    expect(turns.length).toBeGreaterThanOrEqual(2);
    expect(turns[0].role).toBe("user");
    expect(turns[1].role).toBe("model");
    expect(turns[0].text).not.toContain("more_vert");
    expect(turns[1].text).not.toContain("thumb_up");
  });

  it("does not split on possessive words and removes attachment/model-thoughts noise", () => {
    const turns = normalizeBrowserTurns(
      [
        {
          text: "User docs long_file_name.pdf 3,921 tokens user's viewpoint is clear and decisive. Model Thoughts ...",
          images: [{ src: "https://www.gstatic.com/aistudio/watermark/watermark.png", alt: "Thinking" }],
        },
      ],
      "https://aistudio.google.com/prompts/test",
    );

    expect(turns).toHaveLength(1);
    expect(turns[0].text).toContain("user's viewpoint is clear and decisive.");
    expect(turns[0].text).not.toContain("Model Thoughts");
    expect(turns[0].images).toHaveLength(0);
  });

  it("drops product-logo ui images from otherwise valid turns", () => {
    const turns = normalizeBrowserTurns(
      [
        {
          text: "User 这是一段足够长的正常正文，用来确认产品 logo 不会被当成聊天图片保留下来。",
          roleHint: "user",
          images: [
            {
              src: "https://www.gstatic.com/images/branding/productlogos/googleg/v6/24px.svg",
              alt: "Google",
            },
          ],
        },
      ],
      "https://aistudio.google.com/prompts/test",
    );

    expect(turns).toHaveLength(1);
    expect(turns[0].images).toHaveLength(0);
  });

  it("drops model-thought traces with time prefixes and expand footer", () => {
    const turns = normalizeBrowserTurns(
      [
        {
          text: "Model 10:58 PM Thoughts Assessing User's Input I'm currently focused on the user's input and drafting response details. Expand to view",
          roleHint: "chat-turn-container code-block-aligner model render ng-star-inserted",
          images: [],
        },
      ],
      "https://aistudio.google.com/prompts/test",
    );

    expect(turns).toHaveLength(0);
  });

  it("drops user-input thought traces without expand footer", () => {
    const turns = normalizeBrowserTurns(
      [
        {
          text: "User Input I'm currently analyzing this case. Assessing the signals and drafting a response while I'm now refining the approach.",
          roleHint: "user",
          images: [],
        },
      ],
      "https://aistudio.google.com/prompts/test",
    );

    expect(turns).toHaveLength(0);
  });

  it("does not split ms-chat-turn rows by incidental model/user words", () => {
    const turns = normalizeBrowserTurns(
      [
        {
          text: "Model）：这是正文里引用到的一个词，不应该被切成新的 turn。",
          roleHint: "chat-turn-container code-block-aligner model render ng-star-inserted",
          domPath: "ms-chat-turn#turn-abc",
          images: [],
        },
      ],
      "https://aistudio.google.com/prompts/test",
    );

    expect(turns).toHaveLength(1);
    expect(turns[0].text).toContain("这是正文里引用到的一个词");
  });

  it("removes inline code-toolbar artifact tokens", () => {
    const turns = normalizeBrowserTurns(
      [
        {
          text: "User 这是正文。 code Codedownloadcontent_copyexpand_less 后面还是正文。",
          roleHint: "chat-turn-container code-block-aligner render user ng-star-inserted",
          domPath: "ms-chat-turn#turn-code",
          images: [],
        },
      ],
      "https://aistudio.google.com/prompts/test",
    );

    expect(turns).toHaveLength(1);
    expect(turns[0].text).not.toContain("Codedownloadcontent_copyexpand_less");
    expect(turns[0].text).not.toContain("content_copy");
    expect(turns[0].text).toContain("这是正文");
    expect(turns[0].text).toContain("后面还是正文");
  });

  it("removes plain code-download toolbar marker", () => {
    const turns = normalizeBrowserTurns(
      [
        {
          text: "User 正文开始。 code Codedownload 这里继续。",
          roleHint: "chat-turn-container code-block-aligner render user ng-star-inserted",
          domPath: "ms-chat-turn#turn-code-download",
          images: [],
        },
      ],
      "https://aistudio.google.com/prompts/test",
    );

    expect(turns).toHaveLength(1);
    expect(turns[0].text).not.toMatch(/\bcodedownload\b/i);
    expect(turns[0].text).toContain("正文开始");
    expect(turns[0].text).toContain("这里继续");
  });
});

describe("capture quality gate", () => {
  const sourceUrl = "https://aistudio.google.com/prompts/test";

  it("fails strict mode on noisy unknown-role captures", () => {
    const badTurns: SessionTurn[] = Array.from({ length: 10 }, (_, idx) => ({
      id: `t-${String(idx + 1).padStart(6, "0")}`,
      order: idx,
      role: "unknown",
      text: "more_vert toggle navigation menu open options user docs 100 tokens",
      sourceUrl,
      images: [],
    }));

    expect(() => assertCaptureQuality(badTurns, true)).toThrow(/Capture quality gate failed/i);
  });

  it("allows bypass when strict mode is disabled", () => {
    const badTurns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "unknown",
        text: "more_vert toggle navigation menu",
        sourceUrl,
        images: [],
      },
    ];

    expect(() => assertCaptureQuality(badTurns, false)).not.toThrow();
  });
});
