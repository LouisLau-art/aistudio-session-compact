import type { SessionTurn } from "../../types.js";

/**
 * 解析 session.raw.ndjson 为 SessionTurn 数组
 */
export function normalizeSession(ndjsonContent: string): SessionTurn[] {
  const lines = ndjsonContent.trim().split("\n").filter(line => line.trim());
  return lines.map(line => JSON.parse(line) as SessionTurn);
}

/**
 * 从对话文本中提取日期（处理 "现在是3月19号" 这种格式）
 */
export function extractDateFromTurn(turn: SessionTurn): string | null {
  // 匹配 "3月19号"、"3月19日" 格式
  const dateMatch = turn.text.match(/(\d+)月(\d+)(?:号|日)/);
  if (dateMatch) {
    const month = dateMatch[1].padStart(2, "0");
    const day = dateMatch[2].padStart(2, "0");
    return `2026-${month}-${day}`;
  }

  // 匹配完整日期格式
  const fullDateMatch = turn.text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (fullDateMatch) {
    return `${fullDateMatch[1]}-${fullDateMatch[2]}-${fullDateMatch[3]}`;
  }

  return null;
}

/**
 * 归一化实习项目文档
 */
export function normalizeInternshipDocs(docPath: string): any[] {
  // TODO: 实现解析 internship-jd-catalog 文档逻辑
  return [];
}
