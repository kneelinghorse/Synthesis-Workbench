export const runtime = "nodejs";

const readFoundryBaseUrl = () =>
  process.env.OODS_FOUNDRY_MCP_URL?.trim() ||
  process.env.NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL?.trim() ||
  "";

const resolveHealthUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl);
  parsed.pathname = "/health";
  return parsed.toString();
};

const HEALTH_TIMEOUT_MS = 3000;

export async function GET() {
  const baseUrl = readFoundryBaseUrl();
  if (!baseUrl) {
    return Response.json(
      { status: "unconfigured", message: "OODS_FOUNDRY_MCP_URL is not set." },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const start = Date.now();
    const upstream = await fetch(resolveHealthUrl(baseUrl), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;

    if (upstream.ok) {
      return Response.json(
        { status: "online", latencyMs },
        { headers: { "cache-control": "no-store" } }
      );
    }

    return Response.json(
      { status: "offline", latencyMs, httpStatus: upstream.status },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    const isTimeout =
      error instanceof Error && error.name === "AbortError";

    return Response.json(
      {
        status: isTimeout ? "timeout" : "offline",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  } finally {
    clearTimeout(timeout);
  }
}
