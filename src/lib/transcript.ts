import type { ImageEnrichment, SessionTurn, TurnRole } from "../types.js";

interface TranscriptTurn {
  id: string;
  order: number;
  role: TurnRole;
  body: string;
}

export function renderTranscriptText(turns: SessionTurn[], images: ImageEnrichment[] = []): string {
  return buildTranscriptTurns(turns, images)
    .map((turn) => [`[${turn.order}] ${turn.role.toUpperCase()} ${turn.id}`, turn.body].join("\n"))
    .join("\n\n");
}

export function renderTranscriptMarkdown(turns: SessionTurn[], images: ImageEnrichment[] = []): string {
  const blocks = buildTranscriptTurns(turns, images).map((turn) =>
    [`## [${turn.order}] ${toTitleCaseRole(turn.role)} \`${turn.id}\``, turn.body].join("\n\n"),
  );

  return ["# Session Transcript", "", ...blocks].join("\n\n");
}

function buildTranscriptTurns(turns: SessionTurn[], images: ImageEnrichment[]): TranscriptTurn[] {
  const byImageId = new Map(images.map((image) => [image.imageId, image]));

  return [...turns]
    .sort((left, right) => left.order - right.order)
    .map((turn) => {
      const snippets = turn.images.flatMap((image) => {
        const enrichment = byImageId.get(image.id);
        if (!enrichment || enrichment.status !== "ok") return [];

      const parts = [
        enrichment.ocrText ? `OCR: ${enrichment.ocrText}` : "",
        enrichment.visualSummary ? `Visual: ${enrichment.visualSummary}` : "",
        enrichment.relevanceToConversation ? `Relevance: ${enrichment.relevanceToConversation}` : "",
      ].filter(Boolean);

      return parts.length ? [`[Image ${image.id}] ${parts.join(" | ")}`] : [];
    });

      return {
        id: turn.id,
        order: turn.order,
        role: turn.role,
        body: [turn.text, ...snippets].filter(Boolean).join("\n\n"),
      } satisfies TranscriptTurn;
    });
}

function toTitleCaseRole(role: TurnRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
