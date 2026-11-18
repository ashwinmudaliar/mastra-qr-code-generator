import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { digest, GatewayError, handle, nextState, parseSubmit, report, type Store, type StoredRequest } from "../supabase/functions/books-preview-gateway/core";
const now = "2026-11-18T12:00:00.000Z";
const codeId = randomUUID(), visitId = randomUUID();
function input() { return { id: randomUUID(), submissionId: randomUUID(), fingerprint: "a".repeat(64), attribution: { v: 1, codeId, visitId, visitedAt: now, event: "Conference", book: "Both", placement: "Desk" }, books: { Principles: 2, Patterns: 2 }, country: "US", city: "Austin", status: "approved" }; }
const period = { codeIds: [codeId], from: "2026-11-18T00:00:00Z", to: "2026-11-19T00:00:00Z" };
test("preview transitions preserve shipment evidence; invalid transitions and unavailable regional tracking are rejected", () => {
  const row = parseSubmit(input(), now);
  assert.throws(() => nextState(row, "delivered", now), /not available/);
  const shipped = nextState(row, "shipped", now), delivered = nextState(shipped, "delivered", now), cancelled = nextState(delivered, "cancelled", now);
  assert.equal(cancelled.shippedAt, now); assert.equal(cancelled.deliveredAt, now);
  assert.throws(() => nextState(cancelled, "approved", now), /not available/);
  assert.throws(() => nextState({ ...row, country: "AU" }, "shipped", now), /unavailable/);
  assert.throws(() => nextState({ ...row, country: "Other" }, "shipped", now), /unavailable/);
});
test("reports count book units and requests separately, use visit cohorts and snapshot labels, and exclude unlinked records", () => {
  const row = parseSubmit(input(), now);
  const shipped = nextState(row, "shipped", "2026-11-20T00:00:00Z");
  const unrelated = parseSubmit({ ...input(), attribution: null }, now);
  const pending = parseSubmit({ ...input(), country: "AU", status: "pending" }, now);
  const result = report([shipped, unrelated, pending], period, now);
  assert.deepEqual(result.totals, { requests: 2, booksRequested: 8, booksShipped: 4, deliveredOrders: 0, needsAttention: 1 });
  assert.deepEqual(result.coverage, { trackedRequests: 1, untrackedDeliveryRequests: 1 });
  assert.deepEqual(result.byCity.map(r => r.name).sort(), ["Austin, AU", "Austin, US"]);
  assert.equal(report([shipped], { ...period, event: "Renamed event" }, now).totals.requests, 0);
  assert.equal(report([shipped], { ...period, codeIds: [randomUUID()] }, now).totals.requests, 0);
  assert.throws(() => report([shipped], { ...period, from: "2020-01-01" }, now), /period/);
});
test("gateway authenticates, bounds input, replays one submission, rejects conflicts, and hides fingerprints", async () => {
  const rows = new Map<string, StoredRequest>();
  const store: Store = {
    async submit(row) { const prior = [...rows.values()].find(r => r.submissionId === row.submissionId); if (prior) { if (prior.fingerprint !== row.fingerprint) throw new GatewayError(409, "Submission changed"); return prior; } rows.set(row.id, row); return row; },
    async list() { return [...rows.values()]; }, async get(id) { return rows.get(id) ?? null; },
    async transition(before, after) { if (rows.get(before.id)?.version !== before.version) throw new GatewayError(409, "Conflict"); rows.set(after.id, after); return after; }, async delete(id) { rows.delete(id); },
  };
  const key = "b".repeat(48), keyHash = await digest(key);
  const call = (data: unknown, authorization = `Bearer ${key}`) => handle(new Request("https://preview.invalid", { method: "POST", headers: { authorization }, body: JSON.stringify(data) }), { keyHash, store, now: () => now });
  assert.equal((await call({ action: "list" }, "")).status, 401);
  assert.equal((await call({ action: "arbitrary", table: "orders" })).status, 400);
  const payload = input(); const first = await (await call({ action: "submit", ...payload })).json();
  const replay = await (await call({ action: "submit", ...payload, id: randomUUID() })).json();
  assert.equal(first.request.id, replay.request.id); assert.equal(rows.size, 1); assert.equal(first.request.fingerprint, undefined);
  assert.equal((await call({ action: "submit", ...payload, fingerprint: "c".repeat(64) })).status, 409);
  assert.equal((await call({ action: "submit", ...payload, books: { Principles: -1, Patterns: 0 } })).status, 400);
  assert.equal((await call({ action: "list", ignored: "x".repeat(33000) })).status, 413);
  const listing = await (await call({ action: "list" })).json(); assert.equal(listing.requests[0].fingerprint, undefined);
});
