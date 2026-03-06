import { describe, expect, it } from "vitest";

import { buildContextCapsule, heuristicChunkSummary } from "../src/lib/capsule.js";
import type { ChunkSummary, SessionTurn } from "../src/types.js";

describe("buildContextCapsule", () => {
  it("deduplicates key arrays", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "user",
        text: "We need a stable pipeline and must keep decision traceability.",
        sourceUrl: "https://example.com",
        images: [],
      },
    ];

    const summary: ChunkSummary = {
      summary: "summary",
      goals: ["Stable pipeline", "stable pipeline"],
      decisions: ["Use CDP", "use cdp"],
      constraints: ["Must be resumable", "must be resumable"],
      openQuestions: ["How to handle images?"],
      todos: ["Implement capture"],
      keyFacts: ["Session is huge"],
    };

    const capsule = buildContextCapsule({
      rawPath: "raw.ndjson",
      turns,
      chunkSummaries: [{ turnIds: ["t-000001"], summary }],
      modelUsed: "x",
      mode: "heuristic",
    });

    expect(capsule.goals).toEqual(["Stable pipeline"]);
    expect(capsule.decisions).toHaveLength(1);
    expect(capsule.constraints).toEqual(["Must be resumable"]);
  });

  it("builds timeline from chunk summaries instead of every raw turn", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "user",
        text: "We need a stable pipeline.",
        sourceUrl: "https://example.com",
        images: [],
      },
      {
        id: "t-000002",
        order: 1,
        role: "model",
        text: "Use Chrome CDP for capture.",
        sourceUrl: "https://example.com",
        images: [],
      },
      {
        id: "t-000003",
        order: 2,
        role: "user",
        text: "Images still need OCR fallback.",
        sourceUrl: "https://example.com",
        images: [],
      },
    ];

    const chunkSummaries = [
      {
        turnIds: ["t-000001", "t-000002"],
        summary: {
          summary: "User wants a stable pipeline and model proposes Chrome CDP capture.",
          goals: ["Stable pipeline"],
          decisions: ["Use Chrome CDP"],
          constraints: [],
          openQuestions: [],
          todos: [],
          keyFacts: ["Capture runs in Chrome"],
        },
      },
      {
        turnIds: ["t-000003"],
        summary: {
          summary: "User says OCR fallback is still needed for images.",
          goals: [],
          decisions: [],
          constraints: [],
          openQuestions: ["How should OCR fallback work?"],
          todos: ["Add OCR fallback"],
          keyFacts: ["Images need OCR fallback"],
        },
      },
    ] satisfies Array<{ turnIds: string[]; summary: ChunkSummary }>;

    const capsule = buildContextCapsule({
      rawPath: "raw.ndjson",
      turns,
      chunkSummaries,
      modelUsed: "x",
      mode: "heuristic",
    });

    expect(capsule.timeline).toHaveLength(2);
    expect(capsule.timeline[0]?.turnId).toBe("t-000001");
    expect(capsule.timeline[1]?.turnId).toBe("t-000003");
  });

  it("prefers recent decisions and questions when capsule limits are hit", () => {
    const turns: SessionTurn[] = Array.from({ length: 14 }, (_, index) => ({
      id: `t-${String(index + 1).padStart(6, "0")}`,
      order: index,
      role: index % 2 === 0 ? "user" : "model",
      text: `turn ${index + 1}`,
      sourceUrl: "https://example.com",
      images: [],
    }));

    const chunkSummaries = Array.from({ length: 14 }, (_, index) => ({
      turnIds: [turns[index]!.id],
      summary: {
        summary: `chunk ${index + 1}`,
        goals: [],
        decisions: [`decision ${index + 1}`],
        constraints: [],
        openQuestions: [`question ${index + 1}`],
        todos: [],
        keyFacts: [],
      },
    })) satisfies Array<{ turnIds: string[]; summary: ChunkSummary }>;

    const capsule = buildContextCapsule({
      rawPath: "raw.ndjson",
      turns,
      chunkSummaries,
      modelUsed: "x",
      mode: "heuristic",
    });

    expect(capsule.decisions.map((item) => item.decision)).toContain("decision 14");
    expect(capsule.decisions.map((item) => item.decision)).not.toContain("decision 1");
    expect(capsule.openQuestions).toContain("question 14");
    expect(capsule.openQuestions).not.toContain("question 1");
  });

  it("keeps timeline compact while preserving the latest checkpoint", () => {
    const turns: SessionTurn[] = Array.from({ length: 16 }, (_, index) => ({
      id: `t-${String(index + 1).padStart(6, "0")}`,
      order: index,
      role: index % 2 === 0 ? "user" : "model",
      text: `turn ${index + 1}`,
      sourceUrl: "https://example.com",
      images: [],
    }));

    const chunkSummaries = turns.map((turn, index) => ({
      turnIds: [turn.id],
      summary: {
        summary: `summary ${index + 1}`,
        goals: [],
        decisions: [],
        constraints: [],
        openQuestions: [],
        todos: [],
        keyFacts: [],
      },
    })) satisfies Array<{ turnIds: string[]; summary: ChunkSummary }>;

    const capsule = buildContextCapsule({
      rawPath: "raw.ndjson",
      turns,
      chunkSummaries,
      modelUsed: "x",
      mode: "heuristic",
    });

    expect(capsule.timeline.length).toBeLessThanOrEqual(10);
    expect(capsule.timeline.at(-1)?.turnId).toBe("t-000016");
  });

  it("falls back to chunk summaries when extracted sections are empty", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "user",
        text: "misc context",
        sourceUrl: "https://example.com",
        images: [],
      },
    ];

    const capsule = buildContextCapsule({
      rawPath: "raw.ndjson",
      turns,
      chunkSummaries: [
        {
          turnIds: ["t-000001"],
          summary: {
            summary: "Fallback chunk summary",
            goals: [],
            decisions: [],
            constraints: [],
            openQuestions: [],
            todos: [],
            keyFacts: [],
          },
        },
      ],
      modelUsed: "x",
      mode: "heuristic",
    });

    expect(capsule.sessionSummary).toContain("Fallback chunk summary");
  });
});

describe("heuristicChunkSummary", () => {
  it("keeps chunk summaries concise and removes role prefixes", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "user",
        text: "User 我们需要一个稳定的 pipeline，并且不能把原始长段对话直接塞进 compact summary 里，否则新的 session 会被巨大的提示词污染。",
        sourceUrl: "https://example.com",
        images: [],
      },
      {
        id: "t-000002",
        order: 1,
        role: "model",
        text: "Model 可以先把时间线压缩成少量 checkpoints，再把 goals、decisions、constraints 提炼成短句，而不是整段转抄。",
        sourceUrl: "https://example.com",
        images: [],
      },
    ];

    const summary = heuristicChunkSummary(turns);

    expect(summary.summary.length).toBeLessThanOrEqual(400);
    expect(summary.summary).not.toContain("USER:");
    expect(summary.summary).not.toContain("MODEL:");
  });

  it("prefers concrete advice over generic praise", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "user",
        text: "我想减少朋友圈发布，别再被何引牵着走。",
        sourceUrl: "https://example.com",
        images: [],
      },
      {
        id: "t-000002",
        order: 1,
        role: "model",
        text: "Louis，你的觉察非常棒。建议从 3 月开始执行朋友圈减量计划，先别用动态去试探她。",
        sourceUrl: "https://example.com",
        images: [],
      },
      {
        id: "t-000003",
        order: 2,
        role: "user",
        text: "我接下来要不要彻底断联？还是先观察一周？",
        sourceUrl: "https://example.com",
        images: [],
      },
    ];

    const summary = heuristicChunkSummary(turns);

    expect(summary.summary).toContain("朋友圈减量计划");
    expect(summary.summary).not.toContain("觉察非常棒");
    expect(summary.decisions.some((item) => item.includes("朋友圈减量计划"))).toBe(true);
    expect(summary.openQuestions.some((item) => item.includes("彻底断联"))).toBe(true);
  });

  it("drops transcript-style speaker labels from extracted goals", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "user",
        text: "最爱的猪猪宝贝：但是实际的生产实践中你往往需要包容她。我：这不是我现在的目标。",
        sourceUrl: "https://example.com",
        images: [],
      },
      {
        id: "t-000002",
        order: 1,
        role: "user",
        text: "我接下来想减少朋友圈发布，不再围着她转。",
        sourceUrl: "https://example.com",
        images: [],
      },
      {
        id: "t-000003",
        order: 2,
        role: "model",
        text: "下一步指令：先减少朋友圈暴露。",
        sourceUrl: "https://example.com",
        images: [],
      },
    ];

    const summary = heuristicChunkSummary(turns);

    expect(summary.goals).toEqual(["我接下来想减少朋友圈发布，不再围着她转。"]);
    expect(summary.goals.join(" ")).not.toContain("最爱的猪猪宝贝：");
  });

  it("keeps only direct user questions instead of quoted narrative questions", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "user",
        text: "她很开心，问是不是别人放那儿的，我说不是。",
        sourceUrl: "https://example.com",
        images: [],
      },
      {
        id: "t-000002",
        order: 1,
        role: "user",
        text: "我要不要继续联系她？",
        sourceUrl: "https://example.com",
        images: [],
      },
    ];

    const summary = heuristicChunkSummary(turns);

    expect(summary.openQuestions).toEqual(["我要不要继续联系她？"]);
  });

  it("keeps explicit limits but drops speaker-label chatter from constraints", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "model",
        text: "汤紫珊（Field 4 的健康人类）：自己花钱买零食，缺人时让出自己的拍子。",
        sourceUrl: "https://example.com",
        images: [],
      },
      {
        id: "t-000002",
        order: 1,
        role: "model",
        text: "你必须提前预约，不能临时起意。",
        sourceUrl: "https://example.com",
        images: [],
      },
    ];

    const summary = heuristicChunkSummary(turns);

    expect(summary.constraints).toEqual(["你必须提前预约，不能临时起意。"]);
  });

  it("keeps English questions in openQuestions instead of decisions", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "user",
        text: "Should we use Chromium or connect to an existing browser?",
        sourceUrl: "https://example.com",
        images: [],
      },
      {
        id: "t-000002",
        order: 1,
        role: "model",
        text: "We should connect to an existing browser profile first.",
        sourceUrl: "https://example.com",
        images: [],
      },
    ];

    const summary = heuristicChunkSummary(turns);

    expect(summary.openQuestions).toContain("Should we use Chromium or connect to an existing browser?");
    expect(summary.decisions).not.toContain("Should we use Chromium or connect to an existing browser?");
  });

  it("does not drop normal guidance that starts with 你说得对", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "model",
        text: "你说得对，我们应该先上线最小可用版本。",
        sourceUrl: "https://example.com",
        images: [],
      },
    ];

    const summary = heuristicChunkSummary(turns);

    expect(summary.summary).toContain("先上线最小可用版本");
    expect(summary.decisions).toContain("你说得对，我们应该先上线最小可用版本。");
  });

  it("does not treat 能不能 questions as constraints", () => {
    const turns: SessionTurn[] = [
      {
        id: "t-000001",
        order: 0,
        role: "user",
        text: "我们能不能先做实验？",
        sourceUrl: "https://example.com",
        images: [],
      },
    ];

    const summary = heuristicChunkSummary(turns);

    expect(summary.openQuestions).toEqual(["我们能不能先做实验？"]);
    expect(summary.constraints).toEqual([]);
  });
});
