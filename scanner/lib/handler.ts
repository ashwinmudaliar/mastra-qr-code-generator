/** This bundle deliberately has no Studio, account, or Books integration imports. */
export const SUPABASE_PROJECT_ORIGIN = "https://ltoyhqrorttppcitdwii.supabase.co";
const GATEWAY_URL = `${SUPABASE_PROJECT_ORIGIN}/functions/v1/public-scan-gateway`;
const SCAN_PATH = /^\/q\/([A-Za-z0-9_-]{12})$/;
const DRAFT_SLUG = "draftpreview";
const RESPONSE_LIMIT = 16_384;
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

type Environment = Record<string, string | undefined>;
type Failure = "configuration" | "gateway";
export type ScannerDependencies = {
  env?: Environment;
  fetch?: typeof globalThis.fetch;
  onFailure?: (reason: Failure) => void;
};

function page(request: Request, status: number, message: string, extraHeaders = {}): Response {
  // All messages are constants. Never include a request, credential, destination,
  // gateway payload, or exception in the public response.
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mastra QR</title><body style="font:16px/1.5 system-ui;background:#020202;color:#f0f0f0;display:grid;min-height:95vh;place-items:center;margin:0"><main style="max-width:400px;padding:32px"><h1 style="font-size:28px;line-height:1.2">This code isn’t available</h1><p>${message}</p><a href="https://www.mastrabooks.dev" style="color:#7aff78">Visit Mastra Books →</a></main></body></html>`;
  return new Response(request.method === "HEAD" ? null : html, {
    status,
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8", ...extraHeaders },
  });
}

function gatewayKey(env: Environment): string | null {
  // Pin this service to the reviewed project. No caller-controlled origin,
  // endpoint, fallback service-role client, or redirect is permitted.
  const origin = env.SUPABASE_URL;
  const key = env.QR_PUBLIC_SCAN_GATEWAY_KEY;
  if (origin !== SUPABASE_PROJECT_ORIGIN && origin !== `${SUPABASE_PROJECT_ORIGIN}/`) return null;
  if (!key || !/^[A-Za-z0-9_-]{32,256}$/.test(key)) return null;
  return key;
}

function countVisit(request: Request): boolean {
  if (request.method !== "GET" || request.headers.has("next-router-prefetch") ||
      /prefetch/i.test(request.headers.get("purpose") ?? "") ||
      /prefetch/i.test(request.headers.get("sec-purpose") ?? "")) return false;
  return !/bot|crawler|spider|slurp|facebookexternalhit|preview|headless/i.test(request.headers.get("user-agent") ?? "");
}

function safeGeo(value: string | null): string {
  if (!value) return "Unknown";
  try { value = decodeURIComponent(value); } catch { return "Unknown"; }
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) || "Unknown";
}

function scanMetadata(request: Request, env: Environment) {
  const ua = request.headers.get("user-agent") ?? "";
  const device = /ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))
    ? "Tablet" : /iphone|ipod|android|mobile/i.test(ua) ? "Mobile"
      : /windows|macintosh|linux|cros/i.test(ua) ? "Desktop" : "Other";
  return {
    country: env.VERCEL === "1" ? safeGeo(request.headers.get("x-vercel-ip-country")) : "Unknown",
    region: env.VERCEL === "1" ? safeGeo(request.headers.get("x-vercel-ip-country-region")) : "Unknown",
    city: env.VERCEL === "1" ? safeGeo(request.headers.get("x-vercel-ip-city")) : "Unknown",
    device,
  };
}

function destination(input: unknown): string {
  if (!input || typeof input !== "object" || !("destination" in input) ||
      typeof input.destination !== "string" || input.destination.length > 4096 ||
      /[\u0000-\u001f\u007f]/.test(input.destination)) throw new Error("Invalid gateway response");
  const url = new URL(input.destination);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      !host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.startsWith("[")) {
    throw new Error("Invalid gateway response");
  }
  // UTMs have already been applied by the gateway. Preserve the destination;
  // this release never rewrites Books hosts or adds fulfillment attribution.
  return url.toString();
}

async function boundedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > RESPONSE_LIMIT || !response.body) {
    await response.body?.cancel();
    throw new Error("Invalid gateway response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > RESPONSE_LIMIT) {
      await reader.cancel();
      throw new Error("Invalid gateway response");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function handleScan(request: Request, dependencies: ScannerDependencies = {}): Promise<Response> {
  const match = SCAN_PATH.exec(new URL(request.url).pathname);
  if (!match) return page(request, 404, "The link may be incomplete. Check the code or ask your event organizer.");
  if (request.method !== "GET" && request.method !== "HEAD") {
    return page(request, 405, "Open this QR link in your browser.", { Allow: "GET, HEAD" });
  }
  const slug = match[1];
  if (slug === DRAFT_SLUG) return page(request, 404, "This QR code was printed from an unsaved preview. Save it in QR Studio to create its tracking link.");

  const env = dependencies.env ?? process.env;
  const key = gatewayKey(env);
  if (!key) {
    dependencies.onFailure?.("configuration");
    return page(request, 503, "Please try again in a moment.");
  }
  try {
    const response = await (dependencies.fetch ?? globalThis.fetch)(GATEWAY_URL, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ slug, count: countVisit(request), metadata: scanMetadata(request, env) }),
    });
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel();
      return page(request, response.status, response.status === 410
        ? "This campaign has ended or is currently paused."
        : "The link may be incomplete. Check the code or ask your event organizer.");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Gateway unavailable");
    }
    const location = destination(await boundedJson(response));
    return new Response(null, { status: 302, headers: { ...headers, Location: location } });
  } catch {
    dependencies.onFailure?.("gateway");
    return page(request, 503, "Please try again in a moment.");
  }
}
