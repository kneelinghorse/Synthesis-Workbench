export const runtime = "nodejs";

const readFoundryBaseUrl = () =>
  process.env.OODS_FOUNDRY_MCP_URL?.trim() ||
  process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL?.trim() ||
  "";

const normalizeFoundryMcpUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl);
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";

  // Always proxy to the JSON-RPC transport.
  parsed.pathname = "/mcp";

  if (pathname === "/mcp" || pathname === "/" || pathname === "") {
    return parsed.toString();
  }

  // If the user provided a /run URL (bridge) or some other path, we still route
  // to /mcp because this endpoint is explicitly for JSON-RPC requests.
  return parsed.toString();
};

export async function POST(request: Request) {
  const baseUrl = readFoundryBaseUrl();
  if (!baseUrl) {
    return new Response("OODS_FOUNDRY_MCP_URL is not set.", { status: 500 });
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
    upstream = await fetch(normalizeFoundryMcpUrl(baseUrl), {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
      },
      body: bodyText,
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(`Foundry MCP request failed: ${detail}`, {
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

