import path from "node:path";

import { runTranscript } from "./transcript.js";
import { evaluateInCdpTarget, fetchCdpTargets, selectCdpPageTarget } from "../lib/cdp.js";
import { writeJson, writeNdjson } from "../lib/fs.js";
import type { ImageRef, SessionTurn, TurnRole } from "../types.js";
import type { CdpTarget } from "../lib/cdp.js";

type ChatgptAuthorRole = "system" | "assistant" | "user" | "tool" | string;

interface ChatgptMessageContent {
  content_type?: string;
  parts?: Array<string | Record<string, unknown>>;
  text?: string;
  language?: string;
  user_profile?: string;
  user_instructions?: string;
}

interface ChatgptMessage {
  id?: string;
  author?: {
    role?: ChatgptAuthorRole;
    name?: string;
    metadata?: unknown;
  };
  content?: ChatgptMessageContent;
  recipient?: string;
  create_time?: number | null;
  metadata?: {
    model_slug?: string;
    is_visually_hidden_from_conversation?: boolean;
    [key: string]: unknown;
  };
}

interface ChatgptNode {
  id?: string;
  message?: ChatgptMessage | null;
  parent?: string;
  children?: string[];
}

export interface ChatgptConversation {
  id: string;
  title?: string;
  create_time?: number;
  update_time?: number;
  current_node?: string;
  mapping: Record<string, ChatgptNode>;
}

export type ChatgptCdpTarget = CdpTarget;

export const selectChatgptCdpTarget = selectCdpPageTarget;

export interface ExportChatgptOptions {
  outDir: string;
  cdpUrl: string;
  urlMatch: string;
  conversationUrl?: string;
  conversationId?: string;
  tabIndex?: number;
}

export interface ExportChatgptResult {
  rawPath: string;
  transcriptTxtPath: string;
  transcriptMdPath: string;
  transcriptReportPath: string;
  reportPath: string;
  conversationId: string;
  sourceUrl: string;
  turnCount: number;
}

interface ExportChatgptDeps {
  fetchConversation: (options: ExportChatgptOptions) => Promise<ChatgptConversation>;
  runTranscript: typeof runTranscript;
}

const defaultDeps: ExportChatgptDeps = {
  fetchConversation: fetchChatgptConversationFromCdp,
  runTranscript,
};

export async function runExportChatgpt(
  options: ExportChatgptOptions,
  deps: ExportChatgptDeps = defaultDeps,
): Promise<ExportChatgptResult> {
  const conversationId = options.conversationId ?? extractChatgptConversationId(options.conversationUrl ?? "");
  if (!conversationId) {
    throw new Error("Missing ChatGPT conversation id. Pass --conversation-url or --conversation-id.");
  }

  const sourceUrl = options.conversationUrl ?? `https://chatgpt.com/c/${conversationId}`;
  const rawPath = path.join(options.outDir, "session.raw.ndjson");
  const reportPath = path.join(options.outDir, "export-chatgpt.report.json");

  const conversation = await deps.fetchConversation({ ...options, conversationId, conversationUrl: sourceUrl });
  const turns = normalizeChatgptConversation(conversation, sourceUrl);
  await writeNdjson(rawPath, turns);

  const transcript = await deps.runTranscript({
    rawPath,
    outDir: options.outDir,
  });

  await writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    provider: "chatgpt",
    conversationId,
    sourceUrl,
    rawPath,
    transcriptTxtPath: transcript.transcriptTxtPath,
    transcriptMdPath: transcript.transcriptMdPath,
    transcriptReportPath: transcript.reportPath,
    turnCount: turns.length,
    title: conversation.title,
    createTime: conversation.create_time,
    updateTime: conversation.update_time,
  });

  return {
    rawPath,
    transcriptTxtPath: transcript.transcriptTxtPath,
    transcriptMdPath: transcript.transcriptMdPath,
    transcriptReportPath: transcript.reportPath,
    reportPath,
    conversationId,
    sourceUrl,
    turnCount: turns.length,
  };
}

export function extractChatgptConversationId(input: string): string {
  if (!input) return "";
  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/c\/([^/?#]+)/);
    return match?.[1] ?? "";
  } catch {
    const match = input.match(/(?:^|\/c\/)([0-9a-fA-F-]{8,}|[^/?#\s]+)/);
    return match?.[1] ?? input.trim();
  }
}

export function normalizeChatgptConversation(conversation: ChatgptConversation, sourceUrl?: string): SessionTurn[] {
  const nodes = extractConversationPath(conversation);
  const url = sourceUrl ?? `https://chatgpt.com/c/${conversation.id}`;
  const turns: SessionTurn[] = [];

  for (const node of nodes) {
    const message = node.message;
    if (!message || shouldSkipChatgptMessage(message)) continue;

    const role = mapChatgptRole(message.author?.role);
    const { text, images } = extractChatgptContent(message, turns.length + 1);
    if (!text && images.length === 0) continue;

    const turnId = `t-${String(turns.length + 1).padStart(6, "0")}`;
    turns.push({
      id: turnId,
      order: turns.length,
      role,
      text,
      sourceUrl: url,
      roleHint: buildRoleHint(node, message),
      images: images.map((image, index) => ({
        ...image,
        id: `img-${String(turns.length + 1).padStart(6, "0")}-${String(index + 1).padStart(3, "0")}`,
        messageId: turnId,
        index,
      })),
    });
  }

  return turns;
}

async function fetchChatgptConversationFromCdp(options: ExportChatgptOptions): Promise<ChatgptConversation> {
  const conversationId = options.conversationId ?? extractChatgptConversationId(options.conversationUrl ?? "");
  if (!conversationId) {
    throw new Error("Missing ChatGPT conversation id. Pass --conversation-url or --conversation-id.");
  }

  const targets = await fetchCdpTargets(options.cdpUrl);
  const target = selectCdpPageTarget(targets, options.urlMatch, options.tabIndex);
  if (!target) {
    const pageCount = targets.filter((candidate) => candidate.type === "page").length;
    throw new Error(`No page URL matched "${options.urlMatch}". Open the target ChatGPT conversation tab first. Found ${pageCount} page tabs.`);
  }

  let value: unknown;
  try {
    value = await evaluateInCdpTarget<unknown>(target, buildChatgptConversationEvalExpression(conversationId));
  } catch (error) {
    console.warn("Direct CDP evaluation failed, trying token extraction + Bun fetch fallback:", error);
    const auth = await fetchChatgptAuthFromCdp(target);
    if (!auth.token) throw new Error("Failed to extract ChatGPT token from CDP");
    return await fetchChatgptConversationFromBun(conversationId, auth);
  }

  if (typeof value !== "string") {
    throw new Error(`ChatGPT CDP evaluation returned ${typeof value}, expected JSON string`);
  }
  return JSON.parse(value) as ChatgptConversation;
}

async function fetchChatgptAuthFromCdp(target: CdpTarget): Promise<{ token: string; accountId?: string; origin: string }> {
  console.log("Extracting ChatGPT auth token from CDP...");
  const expression = `(${async function getAuth(): Promise<string> {
    const origin = location.origin.includes("chat.openai.com") ? "https://chatgpt.com" : location.origin;
    const sessionResponse = await fetch(origin + "/api/auth/session", { credentials: "include" });
    if (!sessionResponse.ok) throw new Error("Auth session fetch failed: " + sessionResponse.status);
    const session = await sessionResponse.json();
    const token = session?.accessToken ?? session?.access_token;

    const workspaceId = document.cookie.match(/(?:^|;\\s*)_account=([^;]+)/)?.[1];
    let accountId: string | undefined;
    try {
      const apiOrigin = origin + "/backend-api";
      const accountsResponse = await fetch(apiOrigin + "/accounts/check/v4-2023-04-27", {
        credentials: "include",
        headers: { Authorization: "Bearer " + token, "X-Authorization": "Bearer " + token },
      });
      if (accountsResponse.ok && workspaceId) {
        const accountsCheck = await accountsResponse.json();
        accountId = accountsCheck?.accounts?.[decodeURIComponent(workspaceId)]?.account?.account_id;
      }
    } catch {
      // Ignored
    }
    return JSON.stringify({ token, accountId, origin });
  }.toString()})()`;

  const value = await evaluateInCdpTarget<string>(target, expression, 60000);
  const auth = JSON.parse(value);
  console.log("Auth token extracted successfully.");
  return auth;
}

async function fetchChatgptConversationFromBun(
  id: string,
  auth: { token: string; accountId?: string; origin: string },
): Promise<ChatgptConversation> {
  const apiOrigin = `${auth.origin}/backend-api`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
    "X-Authorization": `Bearer ${auth.token}`,
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  };
  if (auth.accountId) {
    headers["Chatgpt-Account-Id"] = auth.accountId;
  }

  const response = await fetch(`${apiOrigin}/conversation/${encodeURIComponent(id)}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`ChatGPT conversation fetch from Bun failed: HTTP ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ChatgptConversation;
}

function buildChatgptConversationEvalExpression(conversationId: string): string {
  return `(${async function readChatgptConversation(id: string): Promise<string> {
    if (!location.origin.includes("chatgpt.com") && !location.origin.includes("chat.openai.com")) {
      throw new Error(`Target page is not a ChatGPT page: ${location.href}`);
    }

    const origin = location.origin.includes("chat.openai.com") ? "https://chatgpt.com" : location.origin;
    const apiOrigin = `${origin}/backend-api`;

    const sessionResponse = await fetch(`${origin}/api/auth/session`, { credentials: "include" });
    if (!sessionResponse.ok) {
      throw new Error(`ChatGPT auth session failed: HTTP ${sessionResponse.status}`);
    }
    const session = await sessionResponse.json();
    const token = session?.accessToken ?? session?.access_token;
    if (!token) {
      throw new Error("ChatGPT auth session did not include accessToken");
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "X-Authorization": `Bearer ${token}`,
    };

    const workspaceId = document.cookie.match(/(?:^|;\\s*)_account=([^;]+)/)?.[1];
    try {
      const accountsResponse = await fetch(`${apiOrigin}/accounts/check/v4-2023-04-27`, {
        credentials: "include",
        headers,
      });
      if (accountsResponse.ok && workspaceId) {
        const accountsCheck = await accountsResponse.json();
        const accountId = accountsCheck?.accounts?.[decodeURIComponent(workspaceId)]?.account?.account_id;
        if (accountId) {
          headers["Chatgpt-Account-Id"] = accountId;
        }
      }
    } catch {
      // Personal accounts commonly work without Chatgpt-Account-Id.
    }

    const conversationResponse = await fetch(`${apiOrigin}/conversation/${encodeURIComponent(id)}`, {
      credentials: "include",
      headers,
    });
    if (!conversationResponse.ok) {
      throw new Error(`ChatGPT conversation fetch failed: HTTP ${conversationResponse.status}`);
    }
    return JSON.stringify(await conversationResponse.json());
  }.toString()})(${JSON.stringify(conversationId)})`;
}


function extractConversationPath(conversation: ChatgptConversation): ChatgptNode[] {
  const mapping = conversation.mapping ?? {};
  let currentNodeId = conversation.current_node || findLeafNodeId(mapping);
  const result: ChatgptNode[] = [];
  const seen = new Set<string>();

  while (currentNodeId && !seen.has(currentNodeId)) {
    seen.add(currentNodeId);
    const node = mapping[currentNodeId];
    if (!node) break;
    if (node.parent === undefined) break;
    result.unshift(node);
    currentNodeId = node.parent;
  }

  return result;
}

function findLeafNodeId(mapping: Record<string, ChatgptNode>): string {
  return Object.values(mapping).find((node) => node.id && (!node.children || node.children.length === 0))?.id ?? "";
}

function shouldSkipChatgptMessage(message: ChatgptMessage): boolean {
  if (!message.content) return true;
  if (message.recipient && message.recipient !== "all") return true;
  if (message.metadata?.is_visually_hidden_from_conversation) return true;

  const role = message.author?.role;
  if (role === "system" || role === "tool") return true;

  const contentType = message.content.content_type;
  return (
    contentType === "thoughts" ||
    contentType === "reasoning_recap" ||
    contentType === "model_editable_context" ||
    contentType === "user_editable_context"
  );
}

function mapChatgptRole(role: ChatgptAuthorRole | undefined): TurnRole {
  if (role === "user") return "user";
  if (role === "assistant") return "model";
  if (role === "system") return "system";
  return "unknown";
}

function extractChatgptContent(
  message: ChatgptMessage,
  turnNumber: number,
): { text: string; images: Array<Omit<ImageRef, "id" | "messageId" | "index">> } {
  const content = message.content;
  if (!content) return { text: "", images: [] };

  if (content.content_type === "text") {
    return { text: extractPartsText(content.parts), images: [] };
  }

  if (content.content_type === "multimodal_text") {
    const images: Array<Omit<ImageRef, "id" | "messageId" | "index">> = [];
    const textParts = (content.parts ?? []).flatMap((part, index) => {
      if (typeof part === "string") return [part];
      const assetPointer = getString(part, "asset_pointer") ?? getString(part, "image_url");
      if (assetPointer) {
        images.push({ src: assetPointer, alt: `ChatGPT image ${turnNumber}.${index + 1}` });
      }
      return [];
    });
    return { text: textParts.join("\n").trim(), images };
  }

  if (content.content_type === "code" || content.content_type === "execution_output") {
    return { text: content.text?.trim() ?? "", images: [] };
  }

  return { text: extractPartsText(content.parts) || content.text?.trim() || "", images: [] };
}

function extractPartsText(parts: Array<string | Record<string, unknown>> | undefined): string {
  return (parts ?? [])
    .filter((part): part is string => typeof part === "string")
    .join("\n")
    .trim();
}

function getString(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" ? item : undefined;
}

function buildRoleHint(node: ChatgptNode, message: ChatgptMessage): string {
  return [
    "chatgpt",
    node.id ? `node=${node.id}` : "",
    message.author?.role ? `role=${message.author.role}` : "",
    message.metadata?.model_slug ? `model=${message.metadata.model_slug}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
