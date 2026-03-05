import { describe, expect, it } from "vitest";

import { buildImagePrompt } from "../src/commands/enrichImages.js";

describe("buildImagePrompt", () => {
  it("includes OCR and relevance instructions", () => {
    const prompt = buildImagePrompt("context");
    expect(prompt).toContain("ocr_text");
    expect(prompt).toContain("visual_summary");
    expect(prompt).toContain("relevance_to_context");
  });
});
