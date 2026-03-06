import type { ChunkSummary, ContextCapsule, SessionTurn, TurnRole } from "../types.js";

function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function shortText(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function recentUnique(items: string[], limit: number): string[] {
  const canonical = new Map<string, string>();
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (!canonical.has(key)) {
      canonical.set(key, item);
    }
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]?.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(canonical.get(key) ?? item);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function stripRolePrefix(text: string): string {
  return text.replace(/^(user|model|assistant|system)\s*[:：]?\s*/i, "").trim();
}

function stripVocativePrefix(text: string): string {
  return text
    .replace(
      /^(louis|新宇(?:（louis）)?|刘新宇|兄弟|朋友|哥们|作为你的[“"]?中间件[”"]?)\s*[，,:：]\s*/iu,
      "",
    )
    .trim();
}

function normalizeSentence(text: string): string {
  return stripVocativePrefix(stripRolePrefix(text))
    .replace(/\s+/g, " ")
    .replace(/^[#>*\-\s]+/, "")
    .replace(/\*{1,3}/g, "")
    .trim();
}

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？!?；;])/u)
    .map((part) => normalizeSentence(part))
    .map((part) => part.trim())
    .filter(Boolean);
}

function looksLikeTranscript(text: string): boolean {
  const transcriptLabelWhitelist =
    /^(建议|问题|回复|结论|目标|计划|策略|原则|指令|总结|分析|判断|现状|背景|原因|结果|执行代码|回复文案|应对策略|最高防御准则|下一步指令)/;

  const repeatedLabelMatches = text.match(/(?:^|[\s"“])[^，。！？?!]{1,24}[：:]/g) ?? [];
  if (
    repeatedLabelMatches.filter((match) => {
      const prefix = match.replace(/^[\s"“]+/, "").replace(/[：:]$/, "").trim();
      return prefix && !transcriptLabelWhitelist.test(prefix);
    }).length >= 2
  ) {
    return true;
  }

  const colonMatch = text.match(/^([^：:]{1,32})[：:]/);
  if (colonMatch) {
    const prefix = colonMatch[1]?.trim() ?? "";
    if (prefix && !transcriptLabelWhitelist.test(prefix)) {
      return true;
    }
  }
  const quoteCount = (text.match(/["“”‘’]/g) ?? []).length;
  if (quoteCount >= 4) {
    return true;
  }
  if (/\b\d{1,2}:\d{2}\s*(am|pm)?\b/i.test(text)) {
    return true;
  }
  if (/\[[^\]]{1,20}\]/.test(text)) {
    return true;
  }
  if (
    /(微信|聊天记录|朋友圈|知乎问题)[:：]|(?:^|[\s"“])(?:我|她|他|你|对方)说[:：]|^(?:她|他|我|你)[”"]/.test(text)
  ) {
    return true;
  }
  return false;
}

function isGenericPraise(text: string): boolean {
  if (/(建议|应该|不要|先别|执行|计划|限制|断联|限流|继续|停止|需要|必须|可行|优先|下一步|问题)/.test(text)) {
    return false;
  }

  return /(觉察.*(棒|绝)|价值连城|为你鼓掌|疯狂鼓掌|主体性的凯旋|理论对齐|我感受到|感谢你的坦诚|极具后现代张力|太精准了|让我非常惊喜)/.test(
    text,
  );
}

function isUsefulSentence(text: string): boolean {
  const normalized = text.trim();
  if (normalized.length < 8 || normalized.length > 240) {
    return false;
  }
  if (
    /downloadfullscreen|preview unavailable|content_copy|expand_less|expand_more|sources help|google search suggestions|grounding with google search|learn more/i.test(
      normalized,
    )
  ) {
    return false;
  }
  if (looksLikeTranscript(normalized)) {
    return false;
  }
  if (isGenericPraise(normalized)) {
    return false;
  }
  return true;
}

function sentenceCandidates(turns: SessionTurn[]): Array<{ role: TurnRole; text: string; turnId: string }> {
  return turns.flatMap((turn) =>
    splitIntoSentences(turn.text)
      .filter(isUsefulSentence)
      .map((text) => ({
        role: turn.role,
        text,
        turnId: turn.id,
      })),
  );
}

function sampleAcross<T>(items: T[], max: number): T[] {
  if (items.length <= max) {
    return items;
  }

  const result: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < max; i += 1) {
    const idx = Math.round((i * (items.length - 1)) / Math.max(1, max - 1));
    if (seen.has(idx)) {
      continue;
    }
    seen.add(idx);
    result.push(items[idx] as T);
  }
  return result;
}

function findLatestMatching<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && predicate(item)) {
      return item;
    }
  }
  return undefined;
}

function isGoalCandidate(text: string): boolean {
  if (looksLikeTranscript(text) || /[?？]/.test(text) || text.length > 160) {
    return false;
  }

  return /^(我(?:现在|接下来)?(?:想|希望|需要|打算)|我想|我希望|我需要|我打算|打算|希望|需要|想要|目标|(?:i|we)\s+(?:want|need|plan|hope|aim)\b)/i.test(
    text,
  );
}

function isDecisionCandidate(text: string): boolean {
  if (/[?？]/.test(text) || /^(should|how|why|what|can|could|would|is|are|do|does|did|will|which)\b/i.test(text)) {
    return false;
  }

  return /(decide|decision|adopt|switch|use|should|建议|应该|不要|先别|先用|执行|采用|改成|改用|切换|回复|回一句|就这么做|优先|停止|继续|断联|限流|计划)/i.test(
    text,
  );
}

function isConstraintCandidate(text: string): boolean {
  if (/[?？]/.test(text) || /^(should|how|why|what|can|could|would|is|are|do|does|did|will|which)\b/i.test(text)) {
    return false;
  }

  return /(constraint|cannot|must|limit|限制|必须|不能|只用|先用|无官方导出|复用|限流|成本|api key)/i.test(
    text,
  );
}

function isActionableQuestion(text: string): boolean {
  if (
    !/[?？]/.test(text) &&
    !/(为什么|怎么|如何|是否|要不要|该不该|能不能|可不可以|需不需要|是不是|还有什么建议)/.test(text) &&
    !/^(should|how|why|what|can|could|would|is|are|do|does|did|will|which)\b/i.test(text)
  ) {
    return false;
  }

  if (looksLikeTranscript(text) || /^["“]/.test(text)) {
    return false;
  }

  const cuePattern =
    /(为什么|怎么|如何|是否|要不要|该不该|能不能|可不可以|需不需要|是不是|还有什么建议|我应该|接下来|should|how|why|what|can|could|would|is|are|do|does|did|will|which)/i;
  const cueIndex = text.search(cuePattern);
  if (cueIndex > 32) {
    return false;
  }

  return /^(我(?:现在|接下来)?|我们|咱们|要不要|该不该|能不能|可不可以|需不需要|是不是|为什么|怎么|如何|是否|还有什么建议|既然|最后一个就是|should|how|why|what|can|could|would|is|are|do|does|did|will|which)/i.test(
    text,
  );
}

function isTodoCandidate(text: string): boolean {
  if (looksLikeTranscript(text) || text.length > 180) {
    return false;
  }

  return /(todo|next step|action item|待办|下一步|需要做|补充|优化|实现|修复|验证|测试|继续写|继续做|执行)/i.test(
    text,
  );
}

function isKeyFactCandidate(text: string): boolean {
  if (/[?？]/.test(text) || looksLikeTranscript(text)) {
    return false;
  }

  return /^(我(?:现在|目前|刚刚|已经|其实)|目前|现在|刚刚|已经|现状|背景|状态|情况|问题在于|根因|说明)/.test(
    text,
  );
}

function compactList(items: string[], perItemMax: number, limit: number): string[] {
  return recentUnique(
    items.map((item) => shortText(item, perItemMax)),
    limit,
  );
}

function selectTimelineChunks(
  chunks: Array<{ turnIds: string[]; summary: ChunkSummary }>,
  max: number,
): Array<{ turnIds: string[]; summary: ChunkSummary }> {
  if (chunks.length <= max) {
    return chunks;
  }

  const recentCount = Math.min(6, max - 2);
  const earlyCount = Math.max(2, max - recentCount);
  const early = sampleAcross(chunks.slice(0, Math.max(earlyCount, chunks.length - recentCount)), earlyCount);
  const recent = chunks.slice(-recentCount);

  const seen = new Set<string>();
  const result: Array<{ turnIds: string[]; summary: ChunkSummary }> = [];

  for (const chunk of [...early, ...recent]) {
    const key = chunk.turnIds[0] ?? JSON.stringify(chunk.turnIds);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(chunk);
  }

  return result.slice(-max);
}

export function heuristicChunkSummary(turns: SessionTurn[]): ChunkSummary {
  const candidates = sentenceCandidates(turns);
  const userCandidates = candidates.filter((candidate) => candidate.role === "user");
  const modelCandidates = candidates.filter((candidate) => candidate.role === "model");
  const factCandidates = userCandidates.length ? userCandidates : candidates;

  const recentGoal = findLatestMatching(userCandidates, (candidate) => isGoalCandidate(candidate.text));
  const recentDecision =
    findLatestMatching(
      candidates,
      (candidate) => isDecisionCandidate(candidate.text) && !isActionableQuestion(candidate.text),
    ) ?? findLatestMatching(candidates, (candidate) => isDecisionCandidate(candidate.text));
  const recentQuestion = findLatestMatching(userCandidates, (candidate) => isActionableQuestion(candidate.text));
  const fallbackUser = userCandidates.at(-1);

  const summaryParts = uniq(
    [
      recentGoal ? `User focus: ${shortText(recentGoal.text, 120)}` : "",
      recentDecision ? `Working guidance: ${shortText(recentDecision.text, 120)}` : "",
      recentQuestion && recentQuestion.turnId !== recentGoal?.turnId
        ? `Open question: ${shortText(recentQuestion.text, 120)}`
        : "",
      !recentGoal && !recentDecision && fallbackUser ? `Recent context: ${shortText(fallbackUser.text, 120)}` : "",
    ].filter(Boolean),
  ).slice(0, 3);

  const summary = shortText(summaryParts.join(" "), 400);

  return {
    summary,
    goals: compactList(
      userCandidates.filter((candidate) => isGoalCandidate(candidate.text)).map((candidate) => candidate.text),
      160,
      6,
    ),
    decisions: compactList(
      candidates.filter((candidate) => isDecisionCandidate(candidate.text)).map((candidate) => candidate.text),
      160,
      8,
    ),
    constraints: compactList(
      candidates.filter((candidate) => isConstraintCandidate(candidate.text)).map((candidate) => candidate.text),
      160,
      6,
    ),
    openQuestions: compactList(
      userCandidates.filter((candidate) => isActionableQuestion(candidate.text)).map((candidate) => candidate.text),
      160,
      6,
    ),
    todos: compactList(
      candidates.filter((candidate) => isTodoCandidate(candidate.text)).map((candidate) => candidate.text),
      160,
      8,
    ),
    keyFacts: compactList(
      factCandidates.filter((candidate) => isKeyFactCandidate(candidate.text)).map((candidate) => candidate.text),
      160,
      8,
    ),
  };
}

export function buildContextCapsule(input: {
  rawPath: string;
  turns: SessionTurn[];
  chunkSummaries: Array<{ turnIds: string[]; summary: ChunkSummary }>;
  modelUsed: string;
  mode: "llm" | "heuristic";
}): ContextCapsule {
  const allGoals = recentUnique(input.chunkSummaries.flatMap((chunk) => chunk.summary.goals), 8);
  const allDecisions = recentUnique(input.chunkSummaries.flatMap((chunk) => chunk.summary.decisions), 8);
  const allConstraints = recentUnique(input.chunkSummaries.flatMap((chunk) => chunk.summary.constraints), 6);
  const allQuestions = recentUnique(input.chunkSummaries.flatMap((chunk) => chunk.summary.openQuestions), 6);
  const allTodos = recentUnique(input.chunkSummaries.flatMap((chunk) => chunk.summary.todos), 6);
  const allFacts = recentUnique(input.chunkSummaries.flatMap((chunk) => chunk.summary.keyFacts), 8);

  const structuredSummaryLines = [
    allGoals.length ? `Recent user goals: ${allGoals.slice(0, 3).join("; ")}` : "",
    allDecisions.length ? `Working decisions: ${allDecisions.slice(0, 3).join("; ")}` : "",
    allConstraints.length ? `Active constraints: ${allConstraints.slice(0, 3).join("; ")}` : "",
    allQuestions.length ? `Latest open questions: ${allQuestions.slice(0, 3).join("; ")}` : "",
    allTodos.length ? `Next actions under discussion: ${allTodos.slice(0, 3).join("; ")}` : "",
  ]
    .filter(Boolean);

  const fallbackSummary = sampleAcross(
    uniq(input.chunkSummaries.map((chunk) => chunk.summary.summary)).filter(Boolean),
    4,
  )
    .map((line, index) => `${index + 1}. ${shortText(line, 220)}`)
    .join("\n");

  const sessionSummary = structuredSummaryLines.length
    ? structuredSummaryLines.map((line, index) => `${index + 1}. ${shortText(line, 220)}`).join("\n")
    : fallbackSummary;

  const evidenceFor = (needle: string): string[] => {
    const tokens = Array.from(
      new Set((needle.toLowerCase().match(/[a-z0-9]{3,}|[\u4e00-\u9fff]{2,}/g) ?? []).slice(0, 6)),
    );

    return input.turns
      .filter((turn) => tokens.some((token) => turn.text.toLowerCase().includes(token)))
      .slice(0, 4)
      .map((turn) => turn.id);
  };

  const resumeBrief = [
    "Continue the same project with the existing constraints and decisions.",
    allGoals.length ? `Top goals: ${allGoals.slice(0, 5).join("; ")}` : "",
    allDecisions.length ? `Locked decisions: ${allDecisions.slice(0, 5).join("; ")}` : "",
    allConstraints.length ? `Constraints: ${allConstraints.slice(0, 5).join("; ")}` : "",
    allQuestions.length ? `Open questions: ${allQuestions.slice(0, 5).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const timeline = selectTimelineChunks(input.chunkSummaries, 10).map((chunk) => {
    const firstTurn = input.turns.find((turn) => turn.id === chunk.turnIds[0]);
    return {
      turnId: chunk.turnIds[0] ?? "unknown",
      role: firstTurn?.role ?? "unknown",
      summary: shortText(chunk.summary.summary, 180),
    };
  });

  return {
    meta: {
      createdAt: new Date().toISOString(),
      rawPath: input.rawPath,
      turnCount: input.turns.length,
      imageCount: input.turns.reduce((count, turn) => count + turn.images.length, 0),
      chunkCount: input.chunkSummaries.length,
      modelUsed: input.modelUsed,
      mode: input.mode,
    },
    sessionSummary,
    goals: allGoals,
    decisions: allDecisions.map((decision) => ({
      decision,
      evidenceTurnIds: evidenceFor(decision),
    })),
    constraints: allConstraints,
    openQuestions: allQuestions,
    todos: allTodos,
    keyFacts: allFacts.map((fact) => ({
      fact,
      evidenceTurnIds: evidenceFor(fact),
    })),
    timeline,
    resumeBrief,
  };
}

export function formatChunkForModel(turns: SessionTurn[]): string {
  return turns
    .map((turn) => {
      const imageNote = turn.images.length
        ? `\n[images: ${turn.images.map((img) => img.localPath ?? img.src).join(", ")}]`
        : "";
      return `(${turn.id}) ${turn.role.toUpperCase()}: ${turn.text}${imageNote}`;
    })
    .join("\n\n");
}

export function normalizeRoleForPrompt(role: TurnRole): string {
  if (role === "model") return "assistant";
  if (role === "user") return "user";
  return role;
}
