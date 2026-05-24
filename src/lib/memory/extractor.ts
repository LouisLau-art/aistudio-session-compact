import { callDoubaoChat } from "../doubao.js";
import type { SessionTurn } from "../../types.js";
import type { TimelineEvent, Persona } from "./types.js";

const EVENT_EXTRACTION_PROMPT = `
你是一个事件提取专家。请从以下对话中提取关键事件，输出 JSON 数组。

每个事件包含：
- id: 自动生成 evt-xxx 格式 ID
- date: 事件日期（YYYY-MM-DD 格式）
- category: 分类（emotional/decision/milestone/project/health）
- title: 简短标题
- summary: 1-2 句话摘要
- evidenceTurnIds: 对应的 turn ID 数组
- tags: 关键词标签数组

对话内容：
{CONVERSATION}

只输出 JSON，不要其他内容。
`;

const PERSONA_EXTRACTION_PROMPT = `
你是一个人物画像专家。请从以下历史对话中提取用户的个人画像，输出 JSON。

包含：
- coreIdentity: 核心身份（教育、职业阶段、技术栈）
- relationships: 重要人物关系
- preferences: 偏好（沟通、工作流、音乐等）
- currentState: 当前状态（求职、健康等）

对话内容：
{CONVERSATION}

只输出 JSON，不要其他内容。
`;

export async function extractEvents(turns: SessionTurn[]): Promise<TimelineEvent[]> {
  const conversationText = turns.map(t => `[${t.id}] ${t.role}: ${t.text}`).join("\n\n");
  const prompt = EVENT_EXTRACTION_PROMPT.replace("{CONVERSATION}", conversationText.slice(0, 50000));

  try {
    const response = await callDoubaoChat({
      model: process.env.VISION_MODEL ?? "doubao-seed-2-0-pro",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      responseFormat: "json_object"
    });

    return JSON.parse(response.content[0].text) as TimelineEvent[];
  } catch (e) {
    console.error("Failed to parse events:", e);
    return [];
  }
}

export async function extractPersona(turns: SessionTurn[]): Promise<Partial<Persona>> {
  const conversationText = turns.map(t => `${t.role}: ${t.text}`).join("\n\n");
  const prompt = PERSONA_EXTRACTION_PROMPT.replace("{CONVERSATION}", conversationText.slice(0, 50000));

  try {
    const response = await callDoubaoChat({
      model: process.env.VISION_MODEL ?? "doubao-seed-2-0-pro",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      responseFormat: "json_object"
    });

    return JSON.parse(response.content[0].text) as Partial<Persona>;
  } catch (e) {
    console.error("Failed to parse persona:", e);
    return {};
  }
}
