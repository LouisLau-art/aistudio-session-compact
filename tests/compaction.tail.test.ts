import { describe, expect, it } from "vitest";

import { selectPreservedTail } from "../src/lib/compaction-tail.js";
import type { SessionTurn } from "../src/types.js";

function makeTurn(order: number, text: string): SessionTurn {
  return {
    id: `t-${String(order).padStart(6, "0")}`,
    order,
    role: order % 2 === 0 ? "model" : "user",
    text,
    sourceUrl: "https://aistudio.google.com/prompts/example",
    images: [],
  };
}

describe("selectPreservedTail", () => {
  it("walks backward from the latest turn under a character budget", () => {
    const turns = [
      makeTurn(1, "old-a"),
      makeTurn(2, "old-b"),
      makeTurn(3, "middle-c"),
      makeTurn(4, "recent-d"),
      makeTurn(5, "latest-e"),
    ];

    const selected = selectPreservedTail(turns, {
      tailCharsBudget: "recent-d".length + "latest-e".length,
      minTailTurns: 1,
      maxTailTurns: 10,
    });

    expect(selected.map((turn) => turn.id)).toEqual(["t-000004", "t-000005"]);
  });

  it("respects min and max turn limits while keeping whole turns intact", () => {
    const turns = [
      makeTurn(1, "alpha"),
      makeTurn(2, "beta"),
      makeTurn(3, "gamma"),
      makeTurn(4, "delta"),
      makeTurn(5, "x".repeat(80)),
    ];

    const minSelected = selectPreservedTail(turns, {
      tailCharsBudget: 1,
      minTailTurns: 3,
      maxTailTurns: 10,
    });

    expect(minSelected.map((turn) => turn.id)).toEqual(["t-000003", "t-000004", "t-000005"]);

    const maxSelected = selectPreservedTail(turns, {
      tailCharsBudget: 10_000,
      minTailTurns: 1,
      maxTailTurns: 2,
    });

    expect(maxSelected.map((turn) => turn.id)).toEqual(["t-000004", "t-000005"]);

    const longTurnOnly = selectPreservedTail(turns, {
      tailCharsBudget: 10,
      minTailTurns: 1,
      maxTailTurns: 10,
    });

    expect(longTurnOnly).toHaveLength(1);
    expect(longTurnOnly[0]?.text).toBe("x".repeat(80));
  });
});
