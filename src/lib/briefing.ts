import { readFile } from "node:fs/promises";

import { z } from "zod";

import type { CapsulePerson, StateSnapshot, StoryBriefing } from "../types.js";

const briefingSchema = z
  .object({
    background: z
      .object({
        summary: z.string().default(""),
        emotionalContext: z.array(z.string()).default([]),
        workingFrames: z.array(z.string()).default([]),
      })
      .default({
        summary: "",
        emotionalContext: [],
        workingFrames: [],
      }),
    peopleMap: z
      .array(
        z.object({
          name: z.string(),
          relation: z.string().default(""),
          notes: z.string().optional(),
        }),
      )
      .default([]),
    stableFacts: z.array(z.string()).default([]),
    timelineAnchors: z.array(z.string()).default([]),
  })
  .passthrough();

export type CapsuleBriefing = StoryBriefing;

function uniqStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function mergePeople(base: CapsulePerson[], overlay: CapsulePerson[]): CapsulePerson[] {
  const byName = new Map<string, CapsulePerson>();

  for (const person of [...base, ...overlay]) {
    const key = person.name.trim().toLowerCase();
    const previous = byName.get(key);
    byName.set(key, {
      name: person.name.trim(),
      relation: person.relation?.trim() || previous?.relation || "",
      notes: person.notes?.trim() || previous?.notes,
    });
  }

  return Array.from(byName.values());
}

export async function readBriefingFile(filePath: string): Promise<StoryBriefing> {
  const raw = await readFile(filePath, "utf8");
  const parsed = briefingSchema.parse(JSON.parse(raw));

  return {
    background: {
      summary: parsed.background.summary.trim(),
      emotionalContext: uniqStrings(parsed.background.emotionalContext),
      workingFrames: uniqStrings(parsed.background.workingFrames),
    },
    peopleMap: parsed.peopleMap.map((person) => ({
      name: person.name.trim(),
      relation: person.relation.trim(),
      notes: person.notes?.trim() || undefined,
    })),
    stableFacts: uniqStrings(parsed.stableFacts),
    timelineAnchors: uniqStrings(parsed.timelineAnchors),
  };
}

export function applyBriefingToSnapshot(rawSnapshot: StateSnapshot, briefing?: StoryBriefing): StateSnapshot {
  if (!briefing) return rawSnapshot;

  return {
    ...rawSnapshot,
    briefing: {
      ...rawSnapshot.briefing,
      applied: true,
      sourcePath: rawSnapshot.briefing.sourcePath,
    },
    background: {
      summary: briefing.background.summary || rawSnapshot.background.summary,
      emotionalContext: uniqStrings([...rawSnapshot.background.emotionalContext, ...briefing.background.emotionalContext]),
      workingFrames: uniqStrings([...rawSnapshot.background.workingFrames, ...briefing.background.workingFrames]),
    },
    peopleMap: mergePeople(rawSnapshot.peopleMap, briefing.peopleMap),
    stableFacts: uniqStrings([...rawSnapshot.stableFacts, ...briefing.stableFacts]),
    timelineAnchors: uniqStrings([...rawSnapshot.timelineAnchors, ...briefing.timelineAnchors]),
  };
}
