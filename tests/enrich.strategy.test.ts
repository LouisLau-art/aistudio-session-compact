import { describe, expect, it } from "vitest";

import { buildImagePrompt, selectVisionProvider } from "../src/commands/enrichImages.js";

describe("selectVisionProvider", () => {
  it("prefers doubao over gemini in auto mode", () => {
    const provider = selectVisionProvider({
      provider: "auto",
      doubaoApiKey: "dkey",
      geminiApiKey: "gkey",
    });
    expect(provider).toBe("doubao");
  });

  it("falls back to none when no key is available", () => {
    const provider = selectVisionProvider({
      provider: "auto",
      doubaoApiKey: undefined,
      geminiApiKey: undefined,
    });
    expect(provider).toBe("none");
  });

  it("respects explicit none mode", () => {
    const provider = selectVisionProvider({
      provider: "none",
      doubaoApiKey: "dkey",
      geminiApiKey: "gkey",
    });
    expect(provider).toBe("none");
  });
});

describe("buildImagePrompt", () => {
  it("includes OCR hint section", () => {
    const prompt = buildImagePrompt("context", "ocr text here");
    expect(prompt).toContain("OCR hint");
    expect(prompt).toContain("ocr text here");
  });
});
