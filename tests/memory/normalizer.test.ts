import { describe, expect, test } from "vitest";
import { normalizeSession, extractDateFromTurn } from "../../src/lib/memory/normalizer.js";
import type { SessionTurn } from "../../src/types.js";

describe("memory normalizer", () => {
  test("normalizeSession should parse ndjson correctly", () => {
    const sampleNdjson = `{"id":"t-001","order":1,"role":"user","text":"测试内容","sourceUrl":"test","images":[]}`;
    const turns = normalizeSession(sampleNdjson);
    expect(turns.length).toBe(1);
    expect(turns[0].id).toBe("t-001");
    expect(turns[0].role).toBe("user");
  });

  test("extractDateFromTurn should extract date from month/day format", () => {
    const sampleTurn: SessionTurn = {
      id: "t-001",
      order: 1,
      role: "user",
      text: "User 8:17 AM现在是3月19号早上8:11。测试内容",
      sourceUrl: "test",
      images: []
    };
    const date = extractDateFromTurn(sampleTurn);
    expect(date).toBe("2026-03-19");
  });

  test("extractDateFromTurn should extract date from YYYY-MM-DD format", () => {
    const sampleTurn: SessionTurn = {
      id: "t-001",
      order: 1,
      role: "user",
      text: "今天是2026-04-11，天气不错",
      sourceUrl: "test",
      images: []
    };
    const date = extractDateFromTurn(sampleTurn);
    expect(date).toBe("2026-04-11");
  });

  test("extractDateFromTurn should return null when no date found", () => {
    const sampleTurn: SessionTurn = {
      id: "t-001",
      order: 1,
      role: "user",
      text: "随便说点什么，没有日期",
      sourceUrl: "test",
      images: []
    };
    const date = extractDateFromTurn(sampleTurn);
    expect(date).toBeNull();
  });
});
