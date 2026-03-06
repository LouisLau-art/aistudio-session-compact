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

export interface ExtractTurnsResult {
  rows: BrowserExtractedTurn[];
  savedImages: SavedImage[];
}

export interface ObservedBrowserTurn {
  observationKey: string;
  idx: number;
  row: BrowserExtractedTurn;
}

interface ObservedTurnCandidate {
  domId?: string;
  dataTurnId?: string;
  dataMessageId?: string;
  absoluteTop: number;
  text: string;
  roleHint?: string;
  images: Array<{ src: string; alt?: string }>;
}

interface VirtualSweepPlan {
  visibleTurnCount: number;
  stepTurns: number;
  scanPadding: number;
  anchors: number[];
}

type SweepDirection = "top-first" | "bottom-first";
type ScrollBlock = "start" | "center" | "end";

interface SweepStep {
  start: number;
  end: number;
  block: ScrollBlock;
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

    const extracted = await extractTurns(page, imagesDir, options.maxImageScreenshots);
    let turns = normalizeBrowserTurns(extracted.rows, sourceUrl);

    if (!turns.length) {
      const fullText = await page.evaluate(() => document.body?.innerText ?? "");
      turns = fallbackTextTurn(fullText, sourceUrl);
    }
    assertAistudioSessionReady(sourceUrl, turns[0]?.text);
    assertCaptureQuality(turns, options.strictCapture ?? true);

    const neededImageSrcs = new Set(turns.flatMap((turn) => turn.images.map((image) => image.src)));
    if (neededImageSrcs.size > 0) {
      const remainingBudget = Math.max(0, options.maxImageScreenshots - extracted.savedImages.length);
      const savedImages =
        remainingBudget > 0
          ? await saveVisibleImages(
              page,
              imagesDir,
              neededImageSrcs,
              remainingBudget,
              extracted.savedImages.length,
            )
          : [];
      attachSavedImages(turns, [...extracted.savedImages, ...savedImages]);
    } else if (extracted.savedImages.length > 0) {
      attachSavedImages(turns, extracted.savedImages);
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
    await disconnectCdpConnection(browser);
  }
}

async function disconnectCdpConnection(browser: Browser): Promise<void> {
  try {
    await browser.close();
    return;
  } catch {
    const conn = (browser as unknown as { _connection?: { close?: () => void } })._connection;
    if (conn && typeof conn.close === "function") {
      conn.close();
    }
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
  let previousTextLen = 0;
  let previousTurnCount = 0;
  let stable = 0;

  for (let i = 0; i < maxIterations; i += 1) {
    const metric = await page.evaluate(() => {
      const textLen = (document.body?.textContent ?? "").length;
      const turnCount = document.querySelectorAll("ms-chat-turn").length;

      const candidates = [
        document.querySelector<HTMLElement>("ms-autoscroll-container"),
        document.querySelector<HTMLElement>(".chat-container"),
        document.scrollingElement as HTMLElement | null,
        document.querySelector<HTMLElement>("main"),
        document.querySelector<HTMLElement>("[role='main']"),
      ].filter(Boolean) as HTMLElement[];

      const deduped = Array.from(new Set(candidates));
      for (const el of deduped) {
        if (el.scrollHeight > el.clientHeight + 50) {
          el.scrollTop = 0;
        }
      }

      window.scrollTo(0, 0);
      return {
        textLen,
        turnCount,
      };
    });

    const grewText = metric.textLen > previousTextLen + 120;
    const grewTurns = metric.turnCount > previousTurnCount;

    if (!grewText && !grewTurns) {
      stable += 1;
    } else {
      stable = 0;
    }

    previousTextLen = Math.max(previousTextLen, metric.textLen);
    previousTurnCount = Math.max(previousTurnCount, metric.turnCount);

    if (stable >= stableRounds) {
      break;
    }

    await page.waitForTimeout(waitMs);
  }
}

async function extractTurns(
  page: Page,
  imagesDir: string,
  maxImageScreenshots: number,
): Promise<ExtractTurnsResult> {
  const turnCount = await page.locator("ms-chat-turn").count();
  if (turnCount >= 20) {
    const hydrated = await extractTurnsFromChatTurns(page, turnCount, imagesDir, maxImageScreenshots);
    return pickExtractResult(hydrated, await extractTurnsBySelectors(page));
  }

  return {
    rows: await extractTurnsBySelectors(page),
    savedImages: [],
  };
}

export function planVirtualSweep(
  totalTurns: number,
  scrollHeight: number,
  clientHeight: number,
  direction: SweepDirection = "bottom-first",
): VirtualSweepPlan {
  const safeTotalTurns = Math.max(1, totalTurns);
  const estimatedTurnHeight = Math.max(1, scrollHeight / safeTotalTurns);
  const visibleTurnCount = Math.max(1, Math.ceil(clientHeight / estimatedTurnHeight));
  const stepTurns = Math.max(1, Math.floor(visibleTurnCount / 1.5));
  const scanPadding = Math.max(12, visibleTurnCount * 8);
  const anchors: number[] = [];

  if (direction === "bottom-first") {
    for (let anchor = safeTotalTurns - 1; anchor >= 0; anchor -= stepTurns) {
      anchors.push(anchor);
    }
    if (anchors.at(-1) !== 0) {
      anchors.push(0);
    }
  } else {
    for (let anchor = 0; anchor < safeTotalTurns; anchor += stepTurns) {
      anchors.push(anchor);
    }
    if (anchors.at(-1) !== safeTotalTurns - 1) {
      anchors.push(safeTotalTurns - 1);
    }
  }

  return {
    visibleTurnCount,
    stepTurns,
    scanPadding,
    anchors: Array.from(new Set(anchors)),
  };
}

export function buildSweepStep(anchor: number, totalTurns: number, scanPadding: number): SweepStep {
  const maxIndex = Math.max(0, totalTurns - 1);
  const safeAnchor = Math.max(0, Math.min(anchor, maxIndex));

  return {
    start: Math.max(0, safeAnchor - scanPadding),
    end: Math.min(maxIndex, safeAnchor + scanPadding),
    block: safeAnchor === 0 ? "start" : safeAnchor === maxIndex ? "end" : "center",
  };
}

export function shouldReplaceTurn(
  previous: ObservedBrowserTurn | undefined,
  next: ObservedBrowserTurn,
): boolean {
  if (!previous) {
    return true;
  }

  const textDelta = next.row.text.length - previous.row.text.length;
  if (textDelta !== 0) {
    return textDelta > 0;
  }

  return next.row.images.length > previous.row.images.length;
}

export function shouldCaptureVisibleImage(
  src: string,
  alt: string | undefined,
  neededSrcs: Set<string>,
): boolean {
  if (!src || !neededSrcs.has(src)) {
    return false;
  }

  const normalizedSrc = src.toLowerCase();
  const normalizedAlt = (alt ?? "").toLowerCase();
  if (
    normalizedSrc.includes("gstatic.com/aistudio/watermark/watermark.png") ||
    normalizedSrc.includes("/images/branding/productlogos/") ||
    normalizedAlt.includes("thinking") ||
    normalizedAlt.includes("watermark")
  ) {
    return false;
  }

  return true;
}

export function buildObservedTurnKey(candidate: {
  domId?: string;
  dataTurnId?: string;
  dataMessageId?: string;
  absoluteTop: number;
  text: string;
}): string {
  return (
    candidate.domId ??
    candidate.dataTurnId ??
    candidate.dataMessageId ??
    `turn-top-${Math.max(0, Math.round(candidate.absoluteTop))}`
  );
}

export function toObservedBrowserTurn(candidate: ObservedTurnCandidate): ObservedBrowserTurn {
  const observationKey = buildObservedTurnKey(candidate);
  return {
    observationKey,
    idx: Math.max(0, Math.round(candidate.absoluteTop)),
    row: {
      text: candidate.text,
      roleHint: candidate.roleHint,
      images: candidate.images,
      domPath: `ms-chat-turn#${observationKey}`,
    },
  };
}

export function mergeObservedTurn(
  previous: ObservedBrowserTurn | undefined,
  next: ObservedBrowserTurn,
): ObservedBrowserTurn {
  if (!previous) {
    return next;
  }

  const preferred = shouldReplaceTurn(previous, next) ? next : previous;
  const imageMap = new Map<string, { src: string; alt?: string }>();
  for (const image of [...previous.row.images, ...next.row.images]) {
    const key = `${image.src}|${image.alt ?? ""}`;
    if (!imageMap.has(key)) {
      imageMap.set(key, image);
    }
  }

  return {
    observationKey: previous.observationKey,
    idx: Math.min(previous.idx, next.idx),
    row: {
      text: preferred.row.text,
      roleHint: preferred.row.roleHint ?? previous.row.roleHint ?? next.row.roleHint,
      images: Array.from(imageMap.values()),
      domPath: preferred.row.domPath ?? previous.row.domPath ?? next.row.domPath,
    },
  };
}

export function buildImageCapturePath(
  imagesDir: string,
  existingCount: number,
  addedCount: number,
): string {
  return path.join(imagesDir, `img-${String(existingCount + addedCount + 1).padStart(5, "0")}.png`);
}

export function pickExtractResult(
  hydrated: ExtractTurnsResult,
  fallbackRows: BrowserExtractedTurn[],
): ExtractTurnsResult {
  if (hydrated.rows.length >= 3) {
    return hydrated;
  }

  const fallbackImageSrcs = new Set(
    fallbackRows.flatMap((row) => row.images.map((image) => image.src)).filter(Boolean),
  );

  return {
    rows: fallbackRows,
    savedImages: hydrated.savedImages.filter((image) => fallbackImageSrcs.has(image.src)),
  };
}

async function extractTurnsFromChatTurns(
  page: Page,
  turnCount: number,
  imagesDir: string,
  maxImageScreenshots: number,
): Promise<ExtractTurnsResult> {
  const scrollerMetric = await page.evaluate(() => {
    const scroller =
      document.querySelector<HTMLElement>("ms-autoscroll-container") ??
      document.querySelector<HTMLElement>(".chat-container") ??
      null;

    if (!scroller) {
      return null;
    }

    return {
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
    };
  });

  if (!scrollerMetric) {
    return {
      rows: [],
      savedImages: [],
    };
  }

  const plan = planVirtualSweep(
    turnCount,
    scrollerMetric.scrollHeight,
    scrollerMetric.clientHeight,
    "bottom-first",
  );
  const byTurnId = new Map<string, ObservedBrowserTurn>();
  const savedImages: SavedImage[] = [];

  for (const anchor of plan.anchors) {
    const step = buildSweepStep(anchor, turnCount, plan.scanPadding);
    const didScroll = await page.evaluate(
      ({ targetAnchor, block }) => {
        const turns = Array.from(document.querySelectorAll<HTMLElement>("ms-chat-turn"));
        const target = turns[targetAnchor];
        if (!target) {
          return false;
        }

        target.scrollIntoView({
          block,
          inline: "nearest",
        });
        return true;
      },
      { targetAnchor: anchor, block: step.block },
    );

    if (!didScroll) {
      continue;
    }

    await page.waitForTimeout(30);

    const windowRows = (
      await page.evaluate(
      ({ start, end }) => {
        const turns = Array.from(document.querySelectorAll<HTMLElement>("ms-chat-turn"));
        const scroller =
          document.querySelector<HTMLElement>("ms-autoscroll-container") ??
          document.querySelector<HTMLElement>(".chat-container") ??
          (document.scrollingElement as HTMLElement | null);
        const scrollerTop = scroller?.getBoundingClientRect().top ?? 0;
        const scrollOffset = scroller?.scrollTop ?? window.scrollY;
        const rows: ObservedTurnCandidate[] = [];

        for (let idx = start; idx <= end; idx += 1) {
          const el = turns[idx];
          if (!el) {
            continue;
          }

          const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
          if (text.length < 20) {
            continue;
          }

          const containerClass =
            (el.querySelector(".chat-turn-container") as HTMLElement | null)?.className ?? "";
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

          const rect = el.getBoundingClientRect();
          const absoluteTop = Math.round(rect.top - scrollerTop + scrollOffset);
          rows.push({
            domId: el.getAttribute("id") ?? undefined,
            dataTurnId: el.getAttribute("data-turn-id") ?? undefined,
            dataMessageId: el.getAttribute("data-message-id") ?? undefined,
            absoluteTop,
            text,
            roleHint,
            images,
          });
        }

        return rows;
      },
      { start: step.start, end: step.end },
    )
    ).map(toObservedBrowserTurn);

    for (const row of windowRows) {
      const previous = byTurnId.get(row.observationKey);
      byTurnId.set(row.observationKey, mergeObservedTurn(previous, row));
    }

    const remainingBudget = maxImageScreenshots - savedImages.length;
    if (remainingBudget > 0) {
      const neededImageSrcs = collectPendingImageSrcs(byTurnId.values(), savedImages);
      if (neededImageSrcs.size > 0) {
        const stepSaved = await saveVisibleImages(
          page,
          imagesDir,
          neededImageSrcs,
          remainingBudget,
          savedImages.length,
        );
        savedImages.push(...stepSaved);
      }
    }
  }

  const minExpected = Math.max(3, Math.min(20, Math.floor(turnCount * 0.02)));
  if (byTurnId.size < minExpected) {
    return {
      rows: [],
      savedImages,
    };
  }

  return {
    rows: Array.from(byTurnId.values())
      .sort((a, b) => a.idx - b.idx)
      .map((item) => item.row),
    savedImages,
  };
}

function collectPendingImageSrcs(
  observedTurns: Iterable<ObservedBrowserTurn>,
  savedImages: SavedImage[],
): Set<string> {
  const observedCounts = new Map<string, number>();
  for (const observed of observedTurns) {
    for (const image of observed.row.images) {
      const nextCount = (observedCounts.get(image.src) ?? 0) + 1;
      observedCounts.set(image.src, nextCount);
    }
  }

  const savedCounts = new Map<string, number>();
  for (const image of savedImages) {
    const nextCount = (savedCounts.get(image.src) ?? 0) + 1;
    savedCounts.set(image.src, nextCount);
  }

  return new Set(
    Array.from(observedCounts.entries())
      .filter(([src, count]) => count > (savedCounts.get(src) ?? 0))
      .map(([src]) => src),
  );
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
  existingCount = 0,
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
    const alt = (await item.getAttribute("alt")) ?? undefined;
    if (!shouldCaptureVisibleImage(src, alt, neededSrcs)) {
      continue;
    }

    try {
      await item.scrollIntoViewIfNeeded();
      const localPath = buildImageCapturePath(imagesDir, existingCount, saved.length);
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
