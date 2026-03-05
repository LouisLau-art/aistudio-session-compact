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
});
