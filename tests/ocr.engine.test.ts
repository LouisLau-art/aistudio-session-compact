import { describe, expect, it } from "vitest";

import { selectOcrEngine } from "../src/lib/ocr.js";

describe("selectOcrEngine", () => {
  it("uses paddle in auto mode when paddle is available", () => {
    const engine = selectOcrEngine({
      requested: "auto",
      paddleAvailable: true,
      tesseractAvailable: true,
    });
    expect(engine).toBe("paddle");
  });

  it("falls back to tesseract when paddle is unavailable", () => {
    const engine = selectOcrEngine({
      requested: "auto",
      paddleAvailable: false,
      tesseractAvailable: true,
    });
    expect(engine).toBe("tesseract");
  });

  it("falls back to tesseract when paddle requested but unavailable", () => {
    const engine = selectOcrEngine({
      requested: "paddle",
      paddleAvailable: false,
      tesseractAvailable: true,
    });
    expect(engine).toBe("tesseract");
  });

  it("returns none when no OCR backend is available", () => {
    const engine = selectOcrEngine({
      requested: "auto",
      paddleAvailable: false,
      tesseractAvailable: false,
    });
    expect(engine).toBe("none");
  });
});
