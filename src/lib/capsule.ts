import type {
  CapsuleDecision,
  CapsuleFact,
  CapsuleTimelineEntry,
  ChunkSummary,
  ContextCapsule,
  SessionTurn,
  TurnRole,
} from "../types.js";

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

function recentChunkWindowSize(totalChunks: number): number {
  if (totalChunks <= 1) return totalChunks;
  return Math.min(6, Math.max(2, Math.ceil(totalChunks * 0.35)));
}

function splitChunkWindows(
  chunks: Array<{ turnIds: string[]; summary: ChunkSummary }>,
): {
  recentChunks: Array<{ turnIds: string[]; summary: ChunkSummary }>;
  archiveChunks: Array<{ turnIds: string[]; summary: ChunkSummary }>;
} {
  const recentCount = recentChunkWindowSize(chunks.length);
  return {
    recentChunks: chunks.slice(-recentCount),
    archiveChunks: chunks.slice(0, Math.max(0, chunks.length - recentCount)),
  };
}

function collectStrings(
  chunks: Array<{ turnIds: string[]; summary: ChunkSummary }>,
  pick: (summary: ChunkSummary) => string[],
  limit: number,
): string[] {
  return recentUnique(chunks.flatMap((chunk) => pick(chunk.summary)), limit);
}

function collectStableDecisionTexts(
  chunks: Array<{ turnIds: string[]; summary: ChunkSummary }>,
  recentChunks: Array<{ turnIds: string[]; summary: ChunkSummary }>,
  limit: number,
): string[] {
  const recentKeys = new Set(
    recentChunks.flatMap((chunk) => chunk.summary.decisions.map((decision) => decision.trim().toLowerCase())),
  );

  const stats = new Map<
    string,
    {
      text: string;
      count: number;
      seenInRecent: boolean;
      seenInArchive: boolean;
      lastIndex: number;
    }
  >();

  chunks.forEach((chunk, chunkIndex) => {
    const uniqueChunkDecisions = uniq(chunk.summary.decisions);
    for (const rawDecision of uniqueChunkDecisions) {
      const decision = rawDecision.trim();
      if (!decision) continue;

      const key = decision.toLowerCase();
      const entry = stats.get(key) ?? {
        text: decision,
        count: 0,
        seenInRecent: false,
        seenInArchive: false,
        lastIndex: chunkIndex,
      };

      entry.count += 1;
      entry.lastIndex = chunkIndex;
      if (recentKeys.has(key)) {
        entry.seenInRecent = true;
      } else {
        entry.seenInArchive = true;
      }

      stats.set(key, entry);
    }
  });

  return Array.from(stats.values())
    .filter((entry) => entry.count >= 2 || (entry.seenInRecent && entry.seenInArchive))
    .sort((left, right) => {
      if (right.lastIndex !== left.lastIndex) return right.lastIndex - left.lastIndex;
      if (right.count !== left.count) return right.count - left.count;
      return left.text.localeCompare(right.text);
    })
    .slice(0, limit)
    .map((entry) => entry.text);
}

function toTimelineEntries(
  turns: SessionTurn[],
  chunks: Array<{ turnIds: string[]; summary: ChunkSummary }>,
  max: number,
): CapsuleTimelineEntry[] {
  return selectTimelineChunks(chunks, max).map((chunk) => {
    const firstTurn = turns.find((turn) => turn.id === chunk.turnIds[0]);
    return {
      turnId: chunk.turnIds[0] ?? "unknown",
      role: firstTurn?.role ?? "unknown",
      summary: shortText(chunk.summary.summary, 180),
    };
  });
}

function summarizeCurrentState(input: {
  recentGoals: string[];
  recentDecisions: string[];
  recentConstraints: string[];
  recentQuestions: string[];
  recentTodos: string[];
  recentFacts: string[];
}): string {
  const lines = [
    input.recentGoals[0] ? `Current focus: ${input.recentGoals[0]}` : "",
    input.recentDecisions[0] ? `Working stance: ${input.recentDecisions[0]}` : "",
    input.recentConstraints[0] ? `Boundary: ${input.recentConstraints[0]}` : "",
    input.recentQuestions[0] ? `Main unresolved question: ${input.recentQuestions[0]}` : "",
    input.recentFacts[0] ? `Active fact: ${input.recentFacts[0]}` : "",
    input.recentTodos[0] ? `Likely next continuation point: ${input.recentTodos[0]}` : "",
  ].filter(Boolean);

  return lines.length
    ? lines.map((line, index) => `${index + 1}. ${shortText(line, 220)}`).join("\n")
    : "(empty)";
}

function buildPrimarySessionSummary(input: {
  currentSummary: string;
  stableDecisions: string[];
  recentConstraints: string[];
  recentQuestions: string[];
  recentTodos: string[];
  recentFacts: string[];
}): string {
  const lines = [
    input.currentSummary && input.currentSummary !== "(empty)" ? `Current state: ${input.currentSummary.replace(/\n/g, " ")}` : "",
    input.stableDecisions.length ? `Stable decisions: ${input.stableDecisions.slice(0, 3).join("; ")}` : "",
    input.recentFacts.length ? `Active facts: ${input.recentFacts.slice(0, 3).join("; ")}` : "",
    input.recentConstraints.length ? `Active constraints: ${input.recentConstraints.slice(0, 3).join("; ")}` : "",
    input.recentQuestions.length ? `Active open questions: ${input.recentQuestions.slice(0, 3).join("; ")}` : "",
    input.recentTodos.length ? `Likely next topics: ${input.recentTodos.slice(0, 3).join("; ")}` : "",
  ].filter(Boolean);

  return lines.length
    ? lines.map((line, index) => `${index + 1}. ${shortText(line, 220)}`).join("\n")
    : "(empty)";
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
  const { recentChunks, archiveChunks } = splitChunkWindows(input.chunkSummaries);

  const recentGoals = collectStrings(recentChunks, (summary) => summary.goals, 6);
  const recentDecisions = collectStrings(recentChunks, (summary) => summary.decisions, 6);
  const recentConstraints = collectStrings(recentChunks, (summary) => summary.constraints, 6);
  const recentQuestions = collectStrings(recentChunks, (summary) => summary.openQuestions, 6);
  const recentTodos = collectStrings(recentChunks, (summary) => summary.todos, 6);
  const recentFacts = collectStrings(recentChunks, (summary) => summary.keyFacts, 6);

  const allDecisions = recentUnique(input.chunkSummaries.flatMap((chunk) => chunk.summary.decisions), 8);
  const stableDecisionTexts = collectStableDecisionTexts(input.chunkSummaries, recentChunks, 8);
  const archivedGoals = collectStrings(archiveChunks, (summary) => summary.goals, 6);
  const archivedQuestions = collectStrings(archiveChunks, (summary) => summary.openQuestions, 6);
  const archivedFacts = collectStrings(archiveChunks, (summary) => summary.keyFacts, 6);

  const currentSummary = summarizeCurrentState({
    recentGoals,
    recentDecisions,
    recentConstraints,
    recentQuestions,
    recentTodos,
    recentFacts,
  });

  const fallbackSummary = sampleAcross(
    uniq(input.chunkSummaries.map((chunk) => chunk.summary.summary)).filter(Boolean),
    4,
  )
    .map((line, index) => `${index + 1}. ${shortText(line, 220)}`)
    .join("\n");

  const primarySummary = buildPrimarySessionSummary({
    currentSummary,
    stableDecisions: stableDecisionTexts,
    recentConstraints,
    recentQuestions,
    recentTodos,
    recentFacts,
  });
  const sessionSummary = primarySummary !== "(empty)" ? primarySummary : fallbackSummary;

  const evidenceFor = (needle: string): string[] => {
    const tokens = Array.from(
      new Set((needle.toLowerCase().match(/[a-z0-9]{3,}|[\u4e00-\u9fff]{2,}/g) ?? []).slice(0, 6)),
    );

    return input.turns
      .filter((turn) => tokens.some((token) => turn.text.toLowerCase().includes(token)))
      .slice(0, 4)
      .map((turn) => turn.id);
  };

  const toDecisionRecords = (items: string[]): CapsuleDecision[] =>
    items.map((decision) => ({
      decision,
      evidenceTurnIds: evidenceFor(decision),
    }));

  const toFactRecords = (items: string[]): CapsuleFact[] =>
    items.map((fact) => ({
      fact,
      evidenceTurnIds: evidenceFor(fact),
    }));

  const resumeBrief = [
    "Continue the same project with the existing constraints and decisions.",
    recentGoals.length ? `Current objectives: ${recentGoals.slice(0, 5).join("; ")}` : "",
    stableDecisionTexts.length ? `Stable decisions: ${stableDecisionTexts.slice(0, 5).join("; ")}` : "",
    recentFacts.length ? `Active facts: ${recentFacts.slice(0, 5).join("; ")}` : "",
    recentConstraints.length ? `Constraints: ${recentConstraints.slice(0, 5).join("; ")}` : "",
    recentQuestions.length ? `Open questions: ${recentQuestions.slice(0, 5).join("; ")}` : "",
    recentTodos.length ? `Next topics: ${recentTodos.slice(0, 5).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const timeline = toTimelineEntries(input.turns, input.chunkSummaries, 10);
  const recentTimeline = toTimelineEntries(input.turns, recentChunks, 6);

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
    background: {
      summary: "",
      emotionalContext: [],
      workingFrames: [],
    },
    peopleMap: [],
    currentState: {
      summary: currentSummary,
      currentObjectives: recentGoals,
      currentStance: recentUnique([...recentDecisions, ...recentConstraints], 6),
      nextTopics: recentUnique([...recentQuestions, ...recentTodos], 6),
    },
    goals: recentGoals,
    decisions: toDecisionRecords(allDecisions),
    stableDecisions: toDecisionRecords(stableDecisionTexts),
    constraints: recentConstraints,
    openQuestions: recentQuestions,
    todos: recentTodos,
    keyFacts: toFactRecords(recentFacts),
    timeline,
    recentTimeline,
    appendix: {
      archivedGoals,
      archivedQuestions,
      archivedFacts,
    },
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
