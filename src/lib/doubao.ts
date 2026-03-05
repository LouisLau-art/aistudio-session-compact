export interface DoubaoVisionRequest {
  model: string;
  apiKey: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  baseUrl?: string;
}

export interface DoubaoVisionResponse {
  text: string;
  raw: unknown;
}

export async function callDoubaoVision(request: DoubaoVisionRequest): Promise<DoubaoVisionResponse> {
  const baseUrl = (request.baseUrl ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
  const endpoint = `${baseUrl}/chat/completions`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${request.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: request.prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${request.mimeType};base64,${request.imageBase64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Doubao request failed: ${response.status} ${response.statusText} ${text}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  return { text, raw: payload };
}
