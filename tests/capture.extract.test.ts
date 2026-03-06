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
