import { readFile } from "node:fs/promises";

import { z } from "zod";

import { normalizeContextCapsule } from "./capsule-schema.js";
import type { CapsuleBackground, CapsulePerson, ContextCapsule } from "../types.js";

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
  })
  .passthrough();

export interface CapsuleBriefing {
  background: CapsuleBackground;
  peopleMap: CapsulePerson[];
}

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

export async function readBriefingFile(filePath: string): Promise<CapsuleBriefing> {
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
  };
}

export function applyBriefing(rawCapsule: ContextCapsule, briefing?: CapsuleBriefing): ContextCapsule {
  const capsule = normalizeContextCapsule(rawCapsule);
  if (!briefing) return capsule;

  const background: CapsuleBackground = {
    summary: briefing.background.summary || capsule.background.summary,
    emotionalContext: uniqStrings([...capsule.background.emotionalContext, ...briefing.background.emotionalContext]),
    workingFrames: uniqStrings([...capsule.background.workingFrames, ...briefing.background.workingFrames]),
  };

  const peopleMap = mergePeople(capsule.peopleMap, briefing.peopleMap);

  return {
    ...capsule,
    background,
    peopleMap,
  };
}
