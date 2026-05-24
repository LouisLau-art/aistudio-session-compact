export interface CdpTarget {
  id?: string;
  type?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

interface RuntimeEvaluateResponse {
  result?: {
    type?: string;
    value?: unknown;
    description?: string;
  };
  exceptionDetails?: {
    text?: string;
    exception?: {
      description?: string;
      value?: unknown;
    };
  };
}

interface CdpResponse {
  id?: number;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
}

interface PendingCdpRequest {
  resolve: (response: CdpResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export async function fetchCdpTargets(cdpUrl: string): Promise<CdpTarget[]> {
  const targetsResponse = await fetch(cdpEndpoint(cdpUrl, "/json/list"));
  if (!targetsResponse.ok) {
    throw new Error(`Chrome CDP target list failed: HTTP ${targetsResponse.status}`);
  }
  return (await targetsResponse.json()) as CdpTarget[];
}

export function selectCdpPageTarget(
  targets: CdpTarget[],
  urlMatch: string,
  tabIndex?: number,
): CdpTarget | undefined {
  const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
  if (typeof tabIndex === "number") {
    return pages[tabIndex];
  }
  return pages.find((target) => target.url?.includes(urlMatch));
}

export async function evaluateInCdpTarget<T>(
  target: CdpTarget,
  expression: string,
  timeoutMs = 30000,
): Promise<T> {
  if (!target.webSocketDebuggerUrl) {
    throw new Error(`Selected CDP target does not expose a webSocketDebuggerUrl: ${target.url ?? target.id ?? "unknown"}`);
  }

  const client = await CdpPageClient.connect(target.webSocketDebuggerUrl, timeoutMs);
  try {
    const response = await client.send<RuntimeEvaluateResponse>(
      "Runtime.evaluate",
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      timeoutMs,
    );
    if (response.exceptionDetails) {
      throw new Error(formatRuntimeException(response.exceptionDetails));
    }
    return response.result?.value as T;
  } finally {
    client.close();
  }
}

class CdpPageClient {
  private nextId = 1;
  private readonly pending = new Map<number, PendingCdpRequest>();

  private constructor(private readonly ws: any) {
    this.ws.addEventListener("message", (event: { data: unknown }) => {
      void this.handleMessage(event.data);
    });
  }

  static async connect(wsUrl: string, timeoutMs = 30000): Promise<CdpPageClient> {
    const WebSocketCtor = globalThis.WebSocket;
    if (!WebSocketCtor) {
      throw new Error("This runtime does not provide WebSocket; use Bun or Node.js 22+.");
    }

    const ws = new WebSocketCtor(wsUrl);
    const client = new CdpPageClient(ws);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out connecting to CDP page target: ${wsUrl}`)), timeoutMs);
      ws.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      ws.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new Error(`Failed to connect to CDP page target: ${wsUrl}`));
        },
        { once: true },
      );
    });
    return client;
  }

  async send<T>(method: string, params: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
    const id = this.nextId;
    this.nextId += 1;

    const response = await new Promise<CdpResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.ws.send(JSON.stringify({ id, method, params }));
    });

    if (response.error) {
      throw new Error(`CDP ${method} failed: ${response.error.message ?? JSON.stringify(response.error)}`);
    }
    return response.result as T;
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Best-effort cleanup.
    }
  }

  private async handleMessage(data: unknown): Promise<void> {
    const text = await stringifyWebSocketData(data);
    const message = JSON.parse(text) as CdpResponse;
    if (typeof message.id !== "number") return;

    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(message.id);
    pending.resolve(message);
  }
}

async function stringifyWebSocketData(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  if (data && typeof (data as { text?: unknown }).text === "function") {
    return await (data as { text: () => Promise<string> }).text();
  }
  return String(data);
}

function cdpEndpoint(cdpUrl: string, pathname: string): string {
  const url = new URL(cdpUrl);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function formatRuntimeException(exception: RuntimeEvaluateResponse["exceptionDetails"]): string {
  return (
    exception?.exception?.description ??
    (typeof exception?.exception?.value === "string" ? exception.exception.value : undefined) ??
    exception?.text ??
    "CDP evaluation failed"
  );
}
