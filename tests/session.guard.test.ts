import { describe, expect, it } from "vitest";

import { assertAistudioSessionReady } from "../src/lib/sessionGuard.js";

describe("assertAistudioSessionReady", () => {
  it("allows normal AI Studio URLs", () => {
    expect(() =>
      assertAistudioSessionReady("https://aistudio.google.com/prompts/abc123", "normal chat text"),
    ).not.toThrow();
  });

  it("throws for Google sign-in URL", () => {
    expect(() =>
      assertAistudioSessionReady(
        "https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Faistudio.google.com",
      ),
    ).toThrow(/Google sign-in required/);
  });

  it("throws for known sign-in page text markers", () => {
    expect(() =>
      assertAistudioSessionReady(
        "https://aistudio.google.com/prompts/abc123",
        "Email or phone Forgot email? Type the text you hear or see",
      ),
    ).toThrow(/Google sign-in required/);
  });
});
