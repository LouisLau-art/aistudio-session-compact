import { describe, expect, it } from "vitest";

import {
  buildImageCapturePath,
  buildObservedTurnKey,
  buildSweepStep,
  mergeObservedTurn,
  pickExtractResult,
  planVirtualSweep,
  shouldCaptureVisibleImage,
  shouldReplaceTurn,
  toObservedBrowserTurn,
  type ObservedBrowserTurn,
} from "../src/commands/capture.js";

describe("planVirtualSweep", () => {
  it("starts from the bottom for recent-first capture", () => {
    const plan = planVirtualSweep(100, 10_000, 1_000, "bottom-first");

    expect(plan.visibleTurnCount).toBeGreaterThan(0);
    expect(plan.stepTurns).toBeGreaterThan(0);
    expect(plan.scanPadding).toBeGreaterThan(0);
    expect(plan.anchors[0]).toBe(99);
    expect(plan.anchors.at(-1)).toBe(0);
    expect(new Set(plan.anchors).size).toBe(plan.anchors.length);
  });

  it("handles tiny transcripts without duplicate anchors", () => {
    const plan = planVirtualSweep(1, 500, 500, "bottom-first");

    expect(plan.anchors).toEqual([0]);
  });
});

describe("buildSweepStep", () => {
  it("clamps the scan window and picks edge-aware scroll blocks", () => {
    expect(buildSweepStep(0, 100, 12)).toEqual({
      start: 0,
      end: 12,
      block: "start",
    });

    expect(buildSweepStep(99, 100, 12)).toEqual({
      start: 87,
      end: 99,
      block: "end",
    });

    expect(buildSweepStep(40, 100, 12)).toEqual({
      start: 28,
      end: 52,
      block: "center",
    });
  });
});

describe("shouldReplaceTurn", () => {
  it("prefers more complete observations for the same turn", () => {
    const previous: ObservedBrowserTurn = {
      observationKey: "turn-1",
      idx: 10,
      row: {
        text: "short",
        images: [],
        domPath: "ms-chat-turn#turn-1",
      },
    };
    const next: ObservedBrowserTurn = {
      observationKey: "turn-1",
      idx: 10,
      row: {
        text: "a much more complete hydrated row",
        images: [{ src: "https://example.com/image.png" }],
        domPath: "ms-chat-turn#turn-1",
      },
    };

    expect(shouldReplaceTurn(previous, next)).toBe(true);
    expect(shouldReplaceTurn(next, previous)).toBe(false);
  });
});

describe("mergeObservedTurn", () => {
  it("keeps earlier images even when later text wins", () => {
    const previous: ObservedBrowserTurn = {
      observationKey: "turn-1",
      idx: 120,
      row: {
        text: "short text",
        images: [{ src: "https://example.com/first.png" }],
        domPath: "ms-chat-turn#turn-1",
      },
    };
    const next: ObservedBrowserTurn = {
      observationKey: "turn-1",
      idx: 120,
      row: {
        text: "this is the longer hydrated text for the same turn",
        images: [],
        domPath: "ms-chat-turn#turn-1",
      },
    };

    expect(mergeObservedTurn(previous, next)).toEqual({
      observationKey: "turn-1",
      idx: 120,
      row: {
        text: "this is the longer hydrated text for the same turn",
        images: [{ src: "https://example.com/first.png" }],
        domPath: "ms-chat-turn#turn-1",
        roleHint: undefined,
      },
    });
  });
});

describe("buildObservedTurnKey", () => {
  it("falls back to absolute top instead of viewport-local index", () => {
    expect(
      buildObservedTurnKey({
        absoluteTop: 2048,
        text: "A captured row",
      }),
    ).toBe("turn-top-2048");
  });

  it("prefers stable DOM identifiers when available", () => {
    expect(
      buildObservedTurnKey({
        domId: "turn-abc",
        absoluteTop: 2048,
        text: "A captured row",
      }),
    ).toBe("turn-abc");
  });
});

describe("toObservedBrowserTurn", () => {
  it("uses absolute top as the sort key for id-less rows", () => {
    const observed = toObservedBrowserTurn({
      absoluteTop: 512,
      text: "A captured row",
      images: [],
    });

    expect(observed.observationKey).toBe("turn-top-512");
    expect(observed.idx).toBe(512);
    expect(observed.row.domPath).toBe("ms-chat-turn#turn-top-512");
  });
});

describe("shouldCaptureVisibleImage", () => {
  it("skips watermark and product-logo UI images", () => {
    const needed = new Set([
      "https://www.gstatic.com/aistudio/watermark/watermark.png",
      "https://www.gstatic.com/images/branding/productlogos/googleg/v6/24px.svg",
      "https://example.com/chat-image.png",
    ]);

    expect(
      shouldCaptureVisibleImage(
        "https://www.gstatic.com/aistudio/watermark/watermark.png",
        "Thinking",
        needed,
      ),
    ).toBe(false);
    expect(
      shouldCaptureVisibleImage(
        "https://www.gstatic.com/images/branding/productlogos/googleg/v6/24px.svg",
        "Google",
        needed,
      ),
    ).toBe(false);
    expect(shouldCaptureVisibleImage("https://example.com/chat-image.png", "upload", needed)).toBe(
      true,
    );
  });
});

describe("buildImageCapturePath", () => {
  it("advances filenames across multiple save passes", () => {
    expect(buildImageCapturePath("/tmp/images", 0, 0)).toBe("/tmp/images/img-00001.png");
    expect(buildImageCapturePath("/tmp/images", 2, 0)).toBe("/tmp/images/img-00003.png");
    expect(buildImageCapturePath("/tmp/images", 2, 1)).toBe("/tmp/images/img-00004.png");
  });
});

describe("pickExtractResult", () => {
  it("preserves harvested images when fallback rows still reference them", () => {
    const picked = pickExtractResult(
      {
        rows: [],
        savedImages: [{ src: "https://example.com/captured.png", localPath: "/tmp/img-00001.png" }],
      },
      [{ text: "fallback row", images: [{ src: "https://example.com/captured.png" }] }],
    );

    expect(picked.rows).toEqual([
      { text: "fallback row", images: [{ src: "https://example.com/captured.png" }] },
    ]);
    expect(picked.savedImages).toHaveLength(1);
    expect(picked.savedImages[0]?.localPath).toBe("/tmp/img-00001.png");
  });

  it("drops harvested images that are irrelevant to fallback rows", () => {
    const picked = pickExtractResult(
      {
        rows: [],
        savedImages: [{ src: "https://example.com/stale.png", localPath: "/tmp/img-00001.png" }],
      },
      [{ text: "fallback row", images: [{ src: "https://example.com/fallback.png" }] }],
    );

    expect(picked.savedImages).toEqual([]);
  });
});
