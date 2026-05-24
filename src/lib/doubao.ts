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

export interface DoubaoChatRequest {
  model: string;
  apiKey?: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  baseUrl?: string;
  temperature?: number;
  responseFormat?: "text" | "json_object";
}

export interface DoubaoChatResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
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

export async function callDoubaoChat(request: DoubaoChatRequest): Promise<DoubaoChatResponse> {
  const apiKey = request.apiKey ?? process.env.DOUBAO_API_KEY;
  if (!apiKey) {
    throw new Error("DOUBAO_API_KEY environment variable is not set");
  }

  const baseUrl = (request.baseUrl ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
  const endpoint = `${baseUrl}/chat/completions`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      response_format: request.responseFormat === "json_object"
        ? { type: "json_object" }
        : undefined,
      temperature: request.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Doubao chat request failed: ${response.status} ${response.statusText} ${text}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
  return {
    content: [{ type: "text", text: content }],
    raw: payload
  };
}
