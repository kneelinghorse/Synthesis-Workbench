export const runtime = "nodejs";

const readFoundryBaseUrl = () =>
  process.env.OODS_FOUNDRY_MCP_URL?.trim() ||
  process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL?.trim() ||
  "";

const normalizeFoundryRunUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl);
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";

  // Always proxy to the bridge transport.
  parsed.pathname = "/run";

  if (pathname === "/run" || pathname === "/" || pathname === "") {
    return parsed.toString();
  }

  // If the user provided an /mcp URL (JSON-RPC) or some other path, we still
  // route to /run because this endpoint is explicitly for bridge requests.
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
    const upstreamHeaders = new Headers({
      "content-type": request.headers.get("content-type") ?? "application/json",
    });
    const bridgeApproval = request.headers.get("x-bridge-approval");
    if (bridgeApproval) {
      upstreamHeaders.set("x-bridge-approval", bridgeApproval);
    }

    upstream = await fetch(normalizeFoundryRunUrl(baseUrl), {
      method: "POST",
      headers: upstreamHeaders,
      body: bodyText,
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(`Foundry bridge request failed: ${detail}`, {
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
