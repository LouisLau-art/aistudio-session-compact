import { describe, expect, it } from "vitest";

import { chunkTurnsByChars } from "../src/lib/chunking.js";
import type { SessionTurn } from "../src/types.js";

function makeTurn(i: number, length: number): SessionTurn {
  return {
    id: `t-${String(i).padStart(6, "0")}`,
    order: i,
    role: i % 2 === 0 ? "user" : "model",
    text: "x".repeat(length),
    sourceUrl: "https://example.com",
    images: [],
  };
}

describe("chunkTurnsByChars", () => {
  it("splits turns by size budget", () => {
    const turns = [makeTurn(1, 60), makeTurn(2, 60), makeTurn(3, 60)];
    const chunks = chunkTurnsByChars(turns, 100);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(1);
  });

  it("keeps all turns in one chunk when budget is large", () => {
    const turns = [makeTurn(1, 20), makeTurn(2, 20), makeTurn(3, 20)];
    const chunks = chunkTurnsByChars(turns, 200);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(3);
  });
});
