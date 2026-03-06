import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import type { BrowserExtractedTurn } from "../lib/extract.js";
import { assertCaptureQuality, fallbackTextTurn, normalizeBrowserTurns } from "../lib/extract.js";
import { ensureDir, writeJson, writeNdjson } from "../lib/fs.js";
import { assertAistudioSessionReady } from "../lib/sessionGuard.js";
import type { CaptureRunReport, SessionTurn } from "../types.js";

export interface CaptureOptions {
  cdpUrl: string;
  urlMatch: string;
  outDir: string;
  maxScrollIterations: number;
  stableRounds: number;
  scrollWaitMs: number;
  tabIndex?: number;
  strictCapture?: boolean;
  maxImageScreenshots: number;
}

interface SavedImage {
  src: string;
  alt?: string;
  localPath: string;
}

export async function runCapture(options: CaptureOptions): Promise<{
  rawPath: string;
  reportPath: string;
  turns: SessionTurn[];
}> {
  const startedAt = new Date().toISOString();
  const outputDir = path.resolve(options.outDir);
  const imagesDir = path.join(outputDir, "images");
  const rawPath = path.join(outputDir, "session.raw.ndjson");
  const reportPath = path.join(outputDir, "run-report.json");

  await ensureDir(outputDir);
  await ensureDir(imagesDir);

  const browser = await chromium.connectOverCDP(options.cdpUrl);
  try {
    const page = await findTargetPage(browser.contexts(), options.urlMatch, options.tabIndex);
    const sourceUrl = page.url();
    assertAistudioSessionReady(sourceUrl);

    await autoScrollLoad(page, options.maxScrollIterations, options.stableRounds, options.scrollWaitMs);

    const extracted = await extractTurns(page);
    let turns = normalizeBrowserTurns(extracted, sourceUrl);

    if (!turns.length) {
      const fullText = await page.evaluate(() => document.body?.innerText ?? "");
      turns = fallbackTextTurn(fullText, sourceUrl);
    }
    assertAistudioSessionReady(sourceUrl, turns[0]?.text);
    assertCaptureQuality(turns, options.strictCapture ?? true);

    const neededImageSrcs = new Set(turns.flatMap((turn) => turn.images.map((image) => image.src)));
    if (neededImageSrcs.size > 0) {
      const savedImages = await saveVisibleImages(
        page,
        imagesDir,
        neededImageSrcs,
        options.maxImageScreenshots,
      );
      attachSavedImages(turns, savedImages);
    }

    await writeNdjson(rawPath, turns);

    const report: CaptureRunReport = {
      startedAt,
      finishedAt: new Date().toISOString(),
      sourceUrl,
      turnCount: turns.length,
      imageCount: turns.reduce((sum, turn) => sum + turn.images.length, 0),
      outputRawPath: rawPath,
      outputImagesDir: imagesDir,
      notes: [
        "Capture uses heuristic selectors and may include non-message text if UI changes.",
        "Image files are element screenshots from the loaded DOM.",
      ],
    };

    await writeJson(reportPath, report);

    return {
      rawPath,
      reportPath,
      turns,
    };
  } finally {
    disconnectCdpConnection(browser);
  }
}

function disconnectCdpConnection(browser: Browser): void {
  const conn = (browser as unknown as { _connection?: { close?: () => void } })._connection;
  if (conn && typeof conn.close === "function") {
    conn.close();
  }
}

async function findTargetPage(
  contexts: BrowserContext[],
  urlMatch: string,
  tabIndex?: number,
): Promise<Page> {
  const allPages = contexts.flatMap((ctx) => ctx.pages());

  if (typeof tabIndex === "number") {
    const selected = allPages[tabIndex];
    if (selected) {
      return selected;
    }
    throw new Error(`tabIndex=${tabIndex} is out of range. Found ${allPages.length} tabs`);
  }

  const matched = allPages.find((page) => page.url().includes(urlMatch));
  if (!matched) {
    throw new Error(
      `No page URL matched "${urlMatch}". Open the target AI Studio session tab first and keep it active.`,
    );
  }

  return matched;
}

async function autoScrollLoad(
  page: Page,
  maxIterations: number,
  stableRounds: number,
  waitMs: number,
): Promise<void> {
  let previous = 0;
  let stable = 0;

  for (let i = 0; i < maxIterations; i += 1) {
    const metric = await page.evaluate(() => {
      const textLen = (document.body?.textContent ?? "").length;

      const candidates = [
        document.scrollingElement as HTMLElement | null,
        document.querySelector<HTMLElement>("main"),
        document.querySelector<HTMLElement>("[role='main']"),
        document.querySelector<HTMLElement>("ms-chat-turn"),
      ].filter(Boolean) as HTMLElement[];

      const deduped = Array.from(new Set(candidates));
      for (const el of deduped) {
        if (el.scrollHeight > el.clientHeight + 50) {
          el.scrollTop = 0;
        }
      }

      window.scrollTo(0, 0);
      return textLen;
    });

    if (metric <= previous + 120) {
      stable += 1;
    } else {
      stable = 0;
    }

    previous = metric;

    if (stable >= stableRounds) {
      break;
    }

    await page.waitForTimeout(waitMs);
  }
}

async function extractTurns(page: Page): Promise<BrowserExtractedTurn[]> {
  const turnCount = await page.locator("ms-chat-turn").count();
  if (turnCount >= 20) {
    const hydrated = await extractTurnsFromChatTurns(page, turnCount);
    if (hydrated.length >= 3) {
      return hydrated;
    }
  }

  return extractTurnsBySelectors(page);
}

async function extractTurnsFromChatTurns(page: Page, turnCount: number): Promise<BrowserExtractedTurn[]> {
  return page.evaluate(async (totalTurns) => {
    const scroller =
      document.querySelector<HTMLElement>("ms-autoscroll-container") ??
      document.querySelector<HTMLElement>(".chat-container") ??
      null;
    const turns = Array.from(document.querySelectorAll<HTMLElement>("ms-chat-turn"));

    if (!scroller || turns.length < 20) {
      return [];
    }

    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const avgTurnHeight = Math.max(1, scroller.scrollHeight / Math.max(1, turns.length));
    const visibleTurnCount = Math.max(1, Math.ceil(scroller.clientHeight / avgTurnHeight));
    const stepTurns = Math.max(1, Math.floor(visibleTurnCount));
    const scanPadding = Math.max(8, visibleTurnCount * 6);
    const delayMs = 6;
    const byTurnId = new Map<string, { idx: number; row: BrowserExtractedTurn }>();

    for (let idx = 0; idx <= Math.min(turns.length - 1, scanPadding); idx += 1) {
      const el = turns[idx];
      if (!el) continue;
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length < 20) continue;

      const containerClass = (el.querySelector(".chat-turn-container") as HTMLElement | null)?.className ?? "";
      const roleHint =
        containerClass ||
        el.querySelector("[aria-label]")?.getAttribute("aria-label") ||
        el.getAttribute("id") ||
        undefined;

      const images = Array.from(el.querySelectorAll("img"))
        .map((img) => ({
          src: img.getAttribute("src") ?? "",
          alt: img.getAttribute("alt") ?? undefined,
        }))
        .filter((img) => img.src);

      const turnId = el.getAttribute("id") ?? `turn-index-${idx}`;
      const domPath = `ms-chat-turn#${turnId}`;
      const row: BrowserExtractedTurn = { text, roleHint, images, domPath };
      const prev = byTurnId.get(turnId);
      if (!prev || row.text.length > prev.row.text.length) {
        byTurnId.set(turnId, { idx, row });
      }
    }

    for (let anchor = 0; anchor < turns.length; anchor += stepTurns) {
      const target = Math.min(maxScroll, Math.max(0, Math.floor(anchor * avgTurnHeight)));
      scroller.scrollTop = target;
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const start = Math.max(0, anchor - scanPadding);
      const end = Math.min(turns.length - 1, anchor + scanPadding);
      for (let idx = start; idx <= end; idx += 1) {
        const el = turns[idx];
        if (!el) continue;
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text.length < 20) continue;

        const containerClass = (el.querySelector(".chat-turn-container") as HTMLElement | null)?.className ?? "";
        const roleHint =
          containerClass ||
          el.querySelector("[aria-label]")?.getAttribute("aria-label") ||
          el.getAttribute("id") ||
          undefined;

        const images = Array.from(el.querySelectorAll("img"))
          .map((img) => ({
            src: img.getAttribute("src") ?? "",
            alt: img.getAttribute("alt") ?? undefined,
          }))
          .filter((img) => img.src);

        const turnId = el.getAttribute("id") ?? `turn-index-${idx}`;
        const domPath = `ms-chat-turn#${turnId}`;
        const row: BrowserExtractedTurn = { text, roleHint, images, domPath };
        const prev = byTurnId.get(turnId);
        if (!prev || row.text.length > prev.row.text.length) {
          byTurnId.set(turnId, { idx, row });
        }
      }
    }

    if (scroller.scrollTop !== maxScroll) {
      scroller.scrollTop = maxScroll;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      for (let idx = Math.max(0, turns.length - (scanPadding * 2 + 1)); idx <= turns.length - 1; idx += 1) {
        const el = turns[idx];
        if (!el) continue;
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text.length < 20) continue;

        const containerClass = (el.querySelector(".chat-turn-container") as HTMLElement | null)?.className ?? "";
        const roleHint =
          containerClass ||
          el.querySelector("[aria-label]")?.getAttribute("aria-label") ||
          el.getAttribute("id") ||
          undefined;

        const images = Array.from(el.querySelectorAll("img"))
          .map((img) => ({
            src: img.getAttribute("src") ?? "",
            alt: img.getAttribute("alt") ?? undefined,
          }))
          .filter((img) => img.src);

        const turnId = el.getAttribute("id") ?? `turn-index-${idx}`;
        const domPath = `ms-chat-turn#${turnId}`;
        const row: BrowserExtractedTurn = { text, roleHint, images, domPath };
        const prev = byTurnId.get(turnId);
        if (!prev || row.text.length > prev.row.text.length) {
          byTurnId.set(turnId, { idx, row });
        }
      }
    }

    const minExpected = Math.max(3, Math.min(20, Math.floor(totalTurns * 0.02)));
    if (byTurnId.size < minExpected) {
      return [];
    }

    return Array.from(byTurnId.values())
      .sort((a, b) => a.idx - b.idx)
      .map((item) => item.row);
  }, turnCount);
}

async function extractTurnsBySelectors(page: Page): Promise<BrowserExtractedTurn[]> {
  return page.evaluate(() => {
    const selectors = [
      "[data-message-id]",
      "[data-turn-id]",
      "ms-chat-turn",
      "ms-prompt",
      "ms-response",
      "article",
      "div[role='listitem']",
      "section",
    ];

    const candidates: Element[] = [];
    for (const selector of selectors) {
      const list = Array.from(document.querySelectorAll(selector));
      for (const item of list) candidates.push(item);
    }

    const uniqueCandidates = Array.from(new Set(candidates));
    if (!uniqueCandidates.length && document.body) {
      uniqueCandidates.push(document.body);
    }

    const filteredCandidates = uniqueCandidates.filter((el) => {
      for (const other of uniqueCandidates) {
        if (other === el) continue;
        if (!el.contains(other)) continue;
        const childLen = (other.textContent ?? "").replace(/\s+/g, " ").trim().length;
        if (childLen >= 120) {
          return false;
        }
      }
      return true;
    });

    const dedupe = new Set<string>();

    const mapped = filteredCandidates.map((el) => {
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text.length < 20) {
          return null;
        }

        const rect = el.getBoundingClientRect();
        const top = Math.round(rect.top + window.scrollY);
        const key = `${top}:${text.slice(0, 80)}`;
        if (dedupe.has(key)) {
          return null;
        }
        dedupe.add(key);

        const roleHint =
          (el.querySelector(".chat-turn-container") as HTMLElement | null)?.className ??
          el.getAttribute("data-role") ??
          el.getAttribute("aria-label") ??
          (el.querySelector("[aria-label]")?.getAttribute("aria-label") ?? undefined) ??
          undefined;

        const images = Array.from(el.querySelectorAll("img"))
          .map((img) => ({
            src: img.getAttribute("src") ?? "",
            alt: img.getAttribute("alt") ?? undefined,
          }))
          .filter((img) => img.src);

        const domPath = el.tagName.toLowerCase();

        return {
          text,
          roleHint,
          images,
          domPath,
          top,
        };
      });

    const rows = mapped
      .filter(Boolean)
      .map(
        (row) =>
          row as {
            text: string;
            roleHint?: string;
            images: Array<{ src: string; alt?: string }>;
            domPath: string;
            top: number;
          },
      )
      .sort((a, b) => a.top - b.top)
      .map((row) => ({
        text: row.text,
        roleHint: row.roleHint,
        images: row.images,
        domPath: row.domPath,
      }));

    return rows;
  });
}

async function saveVisibleImages(
  page: Page,
  imagesDir: string,
  neededSrcs: Set<string>,
  maxImageScreenshots: number,
): Promise<SavedImage[]> {
  if (maxImageScreenshots <= 0 || neededSrcs.size === 0) {
    return [];
  }

  const locator = page.locator("img");
  const total = await locator.count();
  const saved: SavedImage[] = [];

  for (let idx = 0; idx < total; idx += 1) {
    if (saved.length >= maxImageScreenshots) {
      break;
    }

    const item = locator.nth(idx);
    const src = (await item.getAttribute("src")) ?? "";
    if (!src) {
      continue;
    }
    if (!neededSrcs.has(src)) {
      continue;
    }
    const alt = (await item.getAttribute("alt")) ?? undefined;
    const normalizedSrc = src.toLowerCase();
    const normalizedAlt = (alt ?? "").toLowerCase();
    if (
      normalizedSrc.includes("gstatic.com/aistudio/watermark/watermark.png") ||
      normalizedAlt.includes("thinking") ||
      normalizedAlt.includes("watermark")
    ) {
      continue;
    }

    try {
      await item.scrollIntoViewIfNeeded();
      const localPath = path.join(imagesDir, `img-${String(saved.length + 1).padStart(5, "0")}.png`);
      await item.screenshot({ path: localPath });
      saved.push({ src, alt, localPath });
    } catch {
      // Ignore best-effort image save failure.
    }
  }

  return saved;
}

function attachSavedImages(turns: SessionTurn[], savedImages: SavedImage[]): void {
  const srcBuckets = new Map<string, SavedImage[]>();

  for (const image of savedImages) {
    const list = srcBuckets.get(image.src) ?? [];
    list.push(image);
    srcBuckets.set(image.src, list);
  }

  for (const turn of turns) {
    for (const image of turn.images) {
      const bucket = srcBuckets.get(image.src);
      const saved = bucket?.shift();
      if (saved) {
        image.localPath = saved.localPath;
        image.alt = image.alt ?? saved.alt;
      }
    }
  }
}
