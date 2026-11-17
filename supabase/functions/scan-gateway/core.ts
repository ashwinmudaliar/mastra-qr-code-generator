export type ScanMetadata = { country: string; region: string; city: string; device: "Mobile" | "Tablet" | "Desktop" | "Other" };
export type GatewayCode = {
  id: string;
  destination: string;
  status: string;
  expires_at: string | null;
  utm: unknown;
};
export type GatewayDependencies = {
  keyHash: string;
  findCode: (slug: string) => Promise<GatewayCode | null>;
  insertScan: (codeId: string, metadata: ScanMetadata) => Promise<void>;
  now?: () => number;
  onRecordingError?: () => void;
};
const responseHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: responseHeaders });
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const hasExactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
}
function equalHash(a: string, b: string): boolean {
  if (a.length !== 64 || b.length !== 64) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function parsePayload(input: unknown): { slug: string; count: boolean; metadata: ScanMetadata } | null {
  if (!isObject(input) || !hasExactKeys(input, ["slug", "count", "metadata"]) || typeof input.slug !== "string" || !/^[A-Za-z0-9_-]{12}$/.test(input.slug) || typeof input.count !== "boolean" || !isObject(input.metadata)) return null;
  const metadata = input.metadata;
  if (!hasExactKeys(metadata, ["country", "region", "city", "device"])) return null;
  for (const key of ["country", "region", "city"]) {
    const value = metadata[key];
    if (typeof value !== "string" || !value.trim() || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  }
  if (!["Mobile", "Tablet", "Desktop", "Other"].includes(String(metadata.device))) return null;
  return { slug: input.slug, count: input.count, metadata: metadata as ScanMetadata };
}
export function redirectDestination(code: Pick<GatewayCode, "destination" | "utm">): string {
  if (typeof code.destination !== "string" || code.destination.length > 4096) throw new Error("Invalid destination");
  const url = new URL(code.destination);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.startsWith("[")) throw new Error("Invalid destination");
  if (isObject(code.utm) && code.utm.enabled === true) {
    for (const name of ["source", "medium", "campaign", "content"]) {
      const value = code.utm[name];
      if (typeof value === "string" && value.trim() && value.length <= 160) url.searchParams.set(`utm_${name}`, value.trim());
    }
  }
  return url.toString();
}
async function limitedJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 4096) throw new Error("Too large");
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 4096) { await reader.cancel(); throw new Error("Too large"); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(buffer));
}

export async function handleGateway(request: Request, dependencies: GatewayDependencies): Promise<Response> {
  if (!/^[a-f0-9]{64}$/.test(dependencies.keyHash)) return json({ error: "Gateway not configured" }, 503);
  const authorization = request.headers.get("authorization") ?? "";
  const key = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (key.length < 32 || key.length > 256 || !equalHash(await sha256(key), dependencies.keyHash)) return json({ error: "Unauthorized" }, 401);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let payload;
  try { payload = parsePayload(await limitedJson(request)); } catch { return json({ error: "Invalid request" }, 400); }
  if (!payload) return json({ error: "Invalid request" }, 400);
  try {
    const code = await dependencies.findCode(payload.slug);
    if (!code) return json({ error: "Code not found" }, 404);
    const now = dependencies.now?.() ?? Date.now();
    if (code.status !== "active" || (code.expires_at !== null && (!Number.isFinite(Date.parse(code.expires_at)) || Date.parse(code.expires_at) <= now))) return json({ error: "Code unavailable" }, 410);
    const destination = redirectDestination(code);
    let recorded = false;
    if (payload.count) {
      try { await dependencies.insertScan(code.id, payload.metadata); recorded = true; }
      catch { dependencies.onRecordingError?.(); }
    }
    return json({ destination, recorded });
  } catch {
    return json({ error: "Scan service temporarily unavailable" }, 503);
  }
}
