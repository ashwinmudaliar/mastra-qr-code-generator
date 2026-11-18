export type Status = "received" | "pending" | "approved" | "shipped" | "delivered" | "failed" | "rejected" | "cancelled" | "waitlisted";
export type Attribution = { v: 1; codeId: string; visitId: string; visitedAt: string; event: string; book: string; placement: string };
export type PreviewRequest = { id: string; submissionId: string; attribution: Attribution | null; books: { Principles: number; Patterns: number }; country: string; city: string; status: Status; createdAt: string; updatedAt: string; shippedAt: string | null; deliveredAt: string | null };
export type StoredRequest = PreviewRequest & { fingerprint: string; version: number };
export type Metrics = { requests: number; booksRequested: number; booksShipped: number; deliveredOrders: number; needsAttention: number };
export class GatewayError extends Error { constructor(public status: number, message: string) { super(message); } }
export const transitions: Record<Status, Status[]> = {
  received: ["pending", "approved", "failed", "waitlisted", "rejected", "cancelled"],
  pending: ["approved", "rejected", "cancelled", "failed"], approved: ["shipped", "failed", "cancelled"],
  failed: ["approved", "pending", "cancelled"], rejected: ["pending"], waitlisted: ["pending", "approved", "cancelled"],
  shipped: ["delivered", "cancelled", "failed"], delivered: ["cancelled"], cancelled: [],
};
const uuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const label = (v: unknown, max = 160): v is string => typeof v === "string" && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const status = (v: unknown): v is Status => typeof v === "string" && Object.hasOwn(transitions, v);
const date = (v: unknown): v is string => typeof v === "string" && v.length <= 32 && Number.isFinite(Date.parse(v));
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
// Preview coverage mirrors Books' maintained PBD/Huboo/India country routing.
// AU/NZ and unsupported destinations have no shipment lifecycle to simulate.
const trackedCountries = new Set("US|United States|CA|Canada|IN|India|GB|United Kingdom|AT|Austria|BE|Belgium|BG|Bulgaria|HR|Croatia|CY|Cyprus|CZ|Czech Republic|DK|Denmark|EE|Estonia|FI|Finland|FR|France|DE|Germany|GR|Greece|HU|Hungary|IE|Ireland|IT|Italy|LV|Latvia|LT|Lithuania|LU|Luxembourg|MT|Malta|NL|Netherlands|PL|Poland|PT|Portugal|RO|Romania|SK|Slovakia|SI|Slovenia|ES|Spain|SE|Sweden|CH|Switzerland".toLowerCase().split("|"));
const trackingAvailable = (country: string) => trackedCountries.has(country.trim().toLowerCase());
export function validAttribution(v: unknown): v is Attribution {
  return object(v) && exact(v, ["v", "codeId", "visitId", "visitedAt", "event", "book", "placement"]) && v.v === 1 && uuid(v.codeId) && uuid(v.visitId) && date(v.visitedAt) && label(v.event) && label(v.book) && label(v.placement);
}
export function parseSubmit(input: unknown, now: string): StoredRequest {
  if (!object(input) || !exact(input, ["id", "submissionId", "fingerprint", "attribution", "books", "country", "city", "status"]) || !uuid(input.id) || !uuid(input.submissionId) || typeof input.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(input.fingerprint) || (input.attribution !== null && !validAttribution(input.attribution)) || !object(input.books) || !exact(input.books, ["Principles", "Patterns"]) || !label(input.country, 100) || !input.country.trim() || !label(input.city, 200) || !status(input.status) || !["received", "pending", "approved", "failed", "waitlisted"].includes(input.status)) throw new GatewayError(400, "Invalid preview request");
  for (const value of Object.values(input.books)) if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 10000) throw new GatewayError(400, "Invalid book quantities");
  if (Object.values(input.books).every(v => v === 0)) throw new GatewayError(400, "A book is required");
  return { ...(input as unknown as Pick<StoredRequest, "id" | "submissionId" | "fingerprint" | "attribution" | "books" | "country" | "city" | "status">), createdAt: now, updatedAt: now, shippedAt: null, deliveredAt: null, version: 0 };
}
export function publicRequest(row: StoredRequest): PreviewRequest {
  const { fingerprint: _fingerprint, version: _version, ...rest } = row;
  return rest;
}
export function nextState(row: StoredRequest, next: Status, now: string): StoredRequest {
  if (row.status === next) return row;
  if (!transitions[row.status].includes(next)) throw new GatewayError(409, "This status change is not available");
  if (!trackingAvailable(row.country) && ["shipped", "delivered"].includes(next)) throw new GatewayError(409, "Shipment tracking is unavailable for this destination");
  return { ...row, status: next, updatedAt: now, version: row.version + 1, shippedAt: next === "shipped" ? row.shippedAt ?? now : row.shippedAt, deliveredAt: next === "delivered" ? row.deliveredAt ?? now : row.deliveredAt };
}
const empty = (): Metrics => ({ requests: 0, booksRequested: 0, booksShipped: 0, deliveredOrders: 0, needsAttention: 0 });
function add(metrics: Metrics, row: StoredRequest) {
  const units = row.books.Principles + row.books.Patterns;
  metrics.requests++; metrics.booksRequested += units;
  if (row.shippedAt) metrics.booksShipped += units;
  if (row.deliveredAt) metrics.deliveredOrders++;
  if (["pending", "failed"].includes(row.status)) metrics.needsAttention++;
}
export function report(rows: StoredRequest[], input: unknown, now: string) {
  if (!object(input) || !exact(input, Object.hasOwn(input, "event") ? ["codeIds", "from", "to", "event"] : ["codeIds", "from", "to"]) || (input.event !== undefined && !label(input.event)) || !Array.isArray(input.codeIds) || input.codeIds.length > 500 || !input.codeIds.every(uuid) || !date(input.from) || !date(input.to)) throw new GatewayError(400, "Invalid report filters");
  const from = Date.parse(input.from), to = Date.parse(input.to);
  if (to <= from || to - from > 366 * 86400000) throw new GatewayError(400, "Invalid report period");
  const ids = new Set(input.codeIds);
  const selected = rows.filter(r => r.attribution && ids.has(r.attribution.codeId) && (!input.event || r.attribution.event === input.event) && Date.parse(r.attribution.visitedAt) >= from && Date.parse(r.attribution.visitedAt) < to);
  const totals = empty();
  const codes = new Map<string, Metrics & { codeId: string; event: string; book: string; placement: string }>();
  const countries = new Map<string, Metrics & { name: string }>(), cities = new Map<string, Metrics & { name: string }>();
  for (const row of selected) {
    add(totals, row);
    const a = row.attribution!;
    // Snapshot labels are grouped separately so renaming a campaign cannot rewrite old results.
    const key = JSON.stringify([a.codeId, a.event, a.book, a.placement]);
    if (!codes.has(key)) codes.set(key, { ...empty(), codeId: a.codeId, event: a.event, book: a.book, placement: a.placement });
    add(codes.get(key)!, row);
    for (const [map, name] of [[countries, row.country], [cities, `${row.city || "Unknown"}, ${row.country}`]] as const) {
      if (!map.has(name)) map.set(name, { ...empty(), name });
      add(map.get(name)!, row);
    }
  }
  const untracked = selected.filter(r => !trackingAvailable(r.country)).length;
  return { version: 1 as const, preview: true, updatedAt: now, totals, byCode: [...codes.values()], byCountry: [...countries.values()], byCity: [...cities.values()], coverage: { trackedRequests: selected.length - untracked, untrackedDeliveryRequests: untracked } };
}
export type Store = { submit(row: StoredRequest): Promise<StoredRequest>; list(): Promise<StoredRequest[]>; get(id: string): Promise<StoredRequest | null>; transition(before: StoredRequest, after: StoredRequest): Promise<StoredRequest>; delete(id: string): Promise<void> };
export async function digest(value: string): Promise<string> { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join(""); }
function equal(a: string, b: string) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
export async function handle(request: Request, dependencies: { keyHash: string; store: Store; now?: () => string }): Promise<Response> {
  const json = (data: unknown, code = 200) => new Response(JSON.stringify(data), { status: code, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  if (!/^[a-f0-9]{64}$/.test(dependencies.keyHash)) return json({ error: "Preview storage unavailable" }, 503);
  const authorization = request.headers.get("authorization") ?? "";
  const key = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (key.length < 32 || key.length > 256 || !equal(await digest(key), dependencies.keyHash)) return json({ error: "Unauthorized" }, 401);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    // Bound decoded body size even when content-length is absent.
    if (!request.body || Number(request.headers.get("content-length")) > 32768) throw new GatewayError(400, "Invalid request");
    const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 32768) { await reader.cancel(); throw new GatewayError(413, "Request too large"); } chunks.push(part.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body: unknown; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new GatewayError(400, "Invalid JSON"); }
    if (!object(body) || typeof body.action !== "string") throw new GatewayError(400, "Invalid action");
    const { action, ...payload } = body; const store = dependencies.store, now = dependencies.now?.() ?? new Date().toISOString();
    if (action === "submit") return json({ request: publicRequest(await store.submit(parseSubmit(payload, now))) });
    if (action === "list" && exact(payload, [])) return json({ requests: (await store.list()).map(publicRequest) });
    if (action === "report") return json(report(await store.list(), payload, now));
    if (action === "transition" && exact(payload, ["id", "status"]) && uuid(payload.id) && status(payload.status)) {
      const before = await store.get(payload.id); if (!before) throw new GatewayError(404, "Request not found");
      const after = nextState(before, payload.status, now);
      return json({ request: publicRequest(after === before ? before : await store.transition(before, after)) });
    }
    if (action === "delete" && exact(payload, ["id"]) && uuid(payload.id)) { await store.delete(payload.id); return json({ deleted: true }); }
    throw new GatewayError(400, "Invalid action");
  } catch (error) { return json({ error: error instanceof GatewayError ? error.message : "Preview storage unavailable" }, error instanceof GatewayError ? error.status : 503); }
}
