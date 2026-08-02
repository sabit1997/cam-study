import type { VercelRequest, VercelResponse } from "@vercel/node";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.oeyo-cam.site";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathSegments = (req.query.path as string[]) ?? [];
  const apiPath = "/" + pathSegments.join("/");
  const search = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";

  const headersToForward = new Headers();
  const cookie = req.headers.cookie;
  if (cookie) headersToForward.set("Cookie", cookie);

  const contentType = req.headers["content-type"];
  if (contentType) headersToForward.set("Content-Type", contentType);

  const xTimezone = req.headers["x-user-timezone"];
  if (xTimezone) headersToForward.set("X-User-Timezone", xTimezone as string);

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

    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) res.setHeader("Set-Cookie", setCookie);

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
