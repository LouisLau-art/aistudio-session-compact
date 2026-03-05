import { describe, expect, it } from "vitest";

import { buildImagePrompt, selectVisionProvider } from "../src/commands/enrichImages.js";

describe("selectVisionProvider", () => {
  it("uses doubao when key exists in auto mode", () => {
    const provider = selectVisionProvider({
      provider: "auto",
      doubaoApiKey: "dkey",
    });
    expect(provider).toBe("doubao");
  });

  it("falls back to none when no key is available", () => {
    const provider = selectVisionProvider({
      provider: "auto",
      doubaoApiKey: undefined,
    });
    expect(provider).toBe("none");
  });

  it("respects explicit none mode", () => {
    const provider = selectVisionProvider({
      provider: "none",
      doubaoApiKey: "dkey",
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
