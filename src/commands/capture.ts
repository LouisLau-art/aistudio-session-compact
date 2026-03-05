import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

import type { BrowserExtractedTurn } from "../lib/extract.js";
import { fallbackTextTurn, normalizeBrowserTurns } from "../lib/extract.js";
import { ensureDir, writeJson, writeNdjson } from "../lib/fs.js";
import type { CaptureRunReport, SessionTurn } from "../types.js";

export interface CaptureOptions {
  cdpUrl: string;
  urlMatch: string;
  outDir: string;
  maxScrollIterations: number;
  stableRounds: number;
  scrollWaitMs: number;
  tabIndex?: number;
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
  const page = await findTargetPage(browser.contexts(), options.urlMatch, options.tabIndex);
  const sourceUrl = page.url();

  await autoScrollLoad(page, options.maxScrollIterations, options.stableRounds, options.scrollWaitMs);

  const extracted = await extractTurns(page);
  let turns = normalizeBrowserTurns(extracted, sourceUrl);

  if (!turns.length) {
    const fullText = await page.evaluate(() => document.body?.innerText ?? "");
    turns = fallbackTextTurn(fullText, sourceUrl);
  }

  const savedImages = await saveVisibleImages(page, imagesDir);
  attachSavedImages(turns, savedImages);

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
      const bodyText = document.body?.innerText ?? "";
      const textLen = bodyText.length;

      const scrollables = Array.from(document.querySelectorAll<HTMLElement>("*"))
        .filter((el) => {
          const style = window.getComputedStyle(el);
          const isScrollable = /(auto|scroll)/.test(style.overflowY || "");
          return isScrollable && el.scrollHeight > el.clientHeight + 50;
        })
        .sort((a, b) => b.scrollHeight - a.scrollHeight)
        .slice(0, 3);

      for (const el of scrollables) {
        el.scrollTop = 0;
      }

      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
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

    if (!candidates.length && document.body) {
      candidates.push(document.body);
    }

    const dedupe = new Set<string>();

    const mapped = candidates.map((el) => {
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

async function saveVisibleImages(page: Page, imagesDir: string): Promise<SavedImage[]> {
  const locator = page.locator("img");
  const total = await locator.count();
  const saved: SavedImage[] = [];

  for (let idx = 0; idx < total; idx += 1) {
    const item = locator.nth(idx);
    const src = (await item.getAttribute("src")) ?? "";
    if (!src) {
      continue;
    }

    try {
      await item.scrollIntoViewIfNeeded();
      const localPath = path.join(imagesDir, `img-${String(saved.length + 1).padStart(5, "0")}.png`);
      await item.screenshot({ path: localPath });
      const alt = (await item.getAttribute("alt")) ?? undefined;
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
