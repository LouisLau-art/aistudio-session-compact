export interface GeminiContentPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

export interface GeminiRequest {
  model: string;
  apiKey: string;
  parts: GeminiContentPart[];
  responseMimeType?: string;
  temperature?: number;
}

export interface GeminiResponse {
  text: string;
  raw: unknown;
}

export async function callGemini(request: GeminiRequest): Promise<GeminiResponse> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    request.model,
  )}:generateContent?key=${encodeURIComponent(request.apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: request.parts }],
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        responseMimeType: request.responseMimeType,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${response.statusText} ${text}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("\n")
      .trim() ?? "";

  return { text, raw: payload };
}
