import type { VercelRequest, VercelResponse } from "@vercel/node";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.oeyo-cam.site";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathSegments = (req.query.path as string[]) ?? [];
  const apiPath = "/" + pathSegments.join("/");
  const search = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";

  // hop-by-hop 헤더는 프록시가 직접 제어하므로 제외하고 나머지 전체 포워딩
  const HOP_BY_HOP = new Set(["host", "connection", "transfer-encoding", "te", "trailer", "keep-alive", "proxy-authorization", "upgrade"]);
  const headersToForward = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && value !== undefined) {
      headersToForward.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  try {
    let body: BodyInit | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = JSON.stringify(req.body);
    }

    const upstream = await fetch(`${BACKEND_URL}${apiPath}${search}`, {
      method: req.method ?? "GET",
      headers: headersToForward,
      body,
      cache: "no-store",
    });

    const setCookies = upstream.headers.getSetCookie();
    if (setCookies.length) res.setHeader("Set-Cookie", setCookies);

    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType) res.setHeader("Content-Type", upstreamContentType);

    res.status(upstream.status);
    const responseBody = await upstream.text();
    res.send(responseBody);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: "Proxy request failed." });
  }
}
