export const runtime = "nodejs";

const readStage1BaseUrl = () =>
  process.env.STAGE1_MCP_URL?.trim() ||
  process.env.NEXT_PUBLIC_STAGE1_MCP_URL?.trim() ||
  "";

const normalizeStage1McpUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl);
  parsed.pathname = "/mcp";
  return parsed.toString();
};

export async function POST(request: Request) {
  const baseUrl = readStage1BaseUrl();
  if (!baseUrl) {
    return new Response("STAGE1_MCP_URL is not set.", { status: 500 });
  }

  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch {
    return new Response("Invalid request body.", { status: 400 });
  }

  if (!bodyText.trim()) {
    return new Response("Body is required.", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(normalizeStage1McpUrl(baseUrl), {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
      },
      body: bodyText,
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(`Stage1 MCP request failed: ${detail}`, {
      status: 502,
    });
  }

  const responseText = await upstream.text().catch(() => "");

  return new Response(responseText, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
