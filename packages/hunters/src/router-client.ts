/**
 * Model-agnostic client for an OpenAI-compatible router (the 0G Compute Router).
 * One doorway to many models. Swapping providers is a base-URL change. The
 * router can also return a receipt proving which model actually ran, which we
 * keep for the audit trail.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: ChatUsage | null;
  /** provider receipt / request id, when the router supplies one */
  receipt: string | null;
}

export interface RouterClient {
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export interface OGRouterOptions {
  baseUrl?: string;
  apiKey?: string;
  /** route sensitive work through the router's private/TEE mode when available */
  privateMode?: boolean;
  timeoutMs?: number;
}

export class OGRouterClient implements RouterClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly privateMode: boolean;
  private readonly timeoutMs: number;

  constructor(opts: OGRouterOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.OG_ROUTER_BASE_URL ?? 'https://router-api.0g.ai/v1').replace(/\/$/, '');
    this.apiKey = opts.apiKey ?? process.env.OG_ROUTER_API_KEY ?? '';
    this.privateMode = opts.privateMode ?? process.env.OG_PRIVATE_MODE === 'true';
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    if (!this.apiKey) throw new Error('OG_ROUTER_API_KEY is not set');
  }

  private body(req: ChatRequest, jsonMode: boolean): string {
    return JSON.stringify({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 4096,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });
  }

  private async post(body: string, signal: AbortSignal): Promise<Response> {
    const url = `${this.baseUrl}/chat/completions`;
    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${this.apiKey}`,
      ...(this.privateMode ? { 'x-0g-private': 'true' } : {}),
    };
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { method: 'POST', signal, headers, body });
        // Retry transient upstream errors; return everything else to the caller.
        if (res.status >= 500 || res.status === 429) {
          lastErr = new Error(`router ${res.status}`);
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1) ** 2));
            continue;
          }
        }
        return res;
      } catch (err) {
        lastErr = err; // network error (connect timeout, reset) -> backoff and retry
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1) ** 2));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('router request failed');
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let res = await this.post(this.body(req, Boolean(req.jsonMode)), controller.signal);
      if (!res.ok) {
        const body = await res.text();
        // Some models reject response_format; retry once in plain mode (prompt still asks for JSON).
        if (res.status === 400 && req.jsonMode && /json mode|response_format|model_not_capable/i.test(body)) {
          res = await this.post(this.body(req, false), controller.signal);
          if (!res.ok) throw new Error(`router ${res.status}: ${(await res.text()).slice(0, 500)}`);
        } else {
          throw new Error(`router ${res.status}: ${body.slice(0, 500)}`);
        }
      }
      const json = (await res.json()) as {
        model?: string;
        id?: string;
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const u = json.usage;
      return {
        content: json.choices?.[0]?.message?.content ?? '',
        model: json.model ?? req.model,
        usage: u
          ? {
              promptTokens: u.prompt_tokens ?? 0,
              completionTokens: u.completion_tokens ?? 0,
              totalTokens: u.total_tokens ?? 0,
            }
          : null,
        receipt: json.id ?? null,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Deterministic client for tests and offline mode. */
export class FakeRouterClient implements RouterClient {
  constructor(private readonly handler: (req: ChatRequest) => string) {}
  async chat(req: ChatRequest): Promise<ChatResponse> {
    return {
      content: this.handler(req),
      model: req.model,
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      receipt: `fake-${req.model}`,
    };
  }
}
