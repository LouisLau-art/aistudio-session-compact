import { describe, expect, it } from "vitest";

import { normalizeBrowserTurns } from "../src/lib/extract.js";

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
});
