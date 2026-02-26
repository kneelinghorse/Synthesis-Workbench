export const runtime = "nodejs";

type AnthropicProxyContentBlock = {
  type: string;
  [key: string]: unknown;
};

type AnthropicProxyTool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

type AnthropicProxyBody = {
  messages?: {
    role: "assistant" | "user";
    content: string | AnthropicProxyContentBlock[];
  }[];
  system?: string;
  model?: string;
  max_tokens?: number;
  tools?: AnthropicProxyTool[];
};

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-3-5-sonnet-20240620";
const DEFAULT_MAX_TOKENS = 4096;
const ANTHROPIC_VERSION = "2023-06-01";

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.replace(/\/+$/, "");

const getConfig = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  const maxTokensEnv = Number.parseInt(
    process.env.ANTHROPIC_MAX_TOKENS ?? "",
    10
  );

  return {
    apiKey,
    baseUrl: process.env.ANTHROPIC_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    maxTokens: Number.isFinite(maxTokensEnv) ? maxTokensEnv : DEFAULT_MAX_TOKENS,
  };
};

export async function POST(request: Request) {
  let body: AnthropicProxyBody | null = null;

  try {
    body = (await request.json()) as AnthropicProxyBody;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  if (!body?.messages || body.messages.length === 0) {
    return new Response("messages is required.", { status: 400 });
  }

  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(message, { status: 500 });
  }

  const upstreamBody = {
    model: body.model ?? config.model,
    max_tokens: body.max_tokens ?? config.maxTokens,
    messages: body.messages,
    ...(body.system ? { system: body.system } : {}),
    ...(body.tools && body.tools.length > 0 ? { tools: body.tools } : {}),
    stream: true,
  };

  let upstream: Response;
  try {
    upstream = await fetch(
      `${normalizeBaseUrl(config.baseUrl)}/v1/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(upstreamBody),
        signal: request.signal,
      }
    );
  } catch {
    return new Response("Failed to reach Anthropic upstream.", { status: 502 });
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return new Response(detail || "Anthropic request failed.", {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "text/plain",
      },
    });
  }

  if (!upstream.body) {
    return new Response("Anthropic response stream unavailable.", {
      status: 502,
    });
  }

  const headers = new Headers({
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
