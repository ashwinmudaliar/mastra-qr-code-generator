import assert from "node:assert/strict";
import test from "node:test";
import type { FulfillmentReport, QRCodeRecord } from "../lib/types";
import { fetchFulfillment, fulfillmentFilters, parseFulfillmentReport } from "../lib/server/fulfillment";

const id = "11111111-1111-4111-8111-111111111111";
const metrics = { requests: 1, booksRequested: 20, booksShipped: 20, deliveredOrders: 1, needsAttention: 0 };
const report: FulfillmentReport = { version: 1, preview: true, updatedAt: "2026-11-18T12:00:00.000Z", totals: metrics,
  byCode: [{ codeId: id, event: "Original event", book: "Campaign book", placement: "Booth", ...metrics }],
  byCountry: [{ name: "US", ...metrics }], byCity: [{ name: "Austin", ...metrics }], coverage: { trackedRequests: 1, untrackedDeliveryRequests: 0 } };
const filters = { codeIds: [id], from: "2026-11-01T00:00:00.000Z", to: "2026-11-18T12:00:00.000Z", event: "Original event" };
const env = { QR_BOOKS_PREVIEW_ORIGIN: "https://books-private.vercel.app", QR_BOOKS_REPORT_URL: "https://books-private.vercel.app/api/qr/report", QR_BOOKS_REPORT_KEY: "unit-test-only-report-key-with-32-characters", QR_BOOKS_PROTECTION_BYPASS: "unit-test-only-protection-value" };

test("report filters use authorized codes, preserve UTC visit cohort, and pass frozen event filter", () => {
  const codes = [{ id, event: "Renamed event" }] as QRCodeRecord[];
  const actual = fulfillmentFilters(new URL("https://studio.test/api/fulfillment?days=30&event=Original+event"), codes, new Date("2026-11-18T12:00:00.000Z"));
  assert.deepEqual(actual, { codeIds: [id], event: "Original event", from: "2026-10-20T00:00:00.000Z", to: "2026-11-18T12:00:00.000Z" });
  assert.throws(() => fulfillmentFilters(new URL("https://studio.test/api/fulfillment?codeId=foreign"), codes));
  for (const days of ["0", "367", "1.5", "oops"]) assert.throws(() => fulfillmentFilters(new URL(`https://studio.test/api/fulfillment?days=${days}`), codes));
});

test("private Books request uses server-only credentials, no redirects, and scoped payload", async () => {
  const result = await fetchFulfillment("private", filters, env, async (url, options) => {
    assert.equal(String(url), env.QR_BOOKS_REPORT_URL);
    assert.equal(options?.redirect, "manual");
    assert.deepEqual(JSON.parse(String(options?.body)), filters);
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${env.QR_BOOKS_REPORT_KEY}`);
    assert.equal(headers.get("x-vercel-protection-bypass"), env.QR_BOOKS_PROTECTION_BYPASS);
    return Response.json(report);
  });
  assert.equal(result.status, "connected");
  assert.deepEqual(result.report, report);
  assert.equal(JSON.stringify(result).includes(env.QR_BOOKS_REPORT_KEY), false);
});

test("reports reject out-of-scope codes, inconsistent totals and unexpected personal fields", () => {
  assert.deepEqual(parseFulfillmentReport(report, [id]), report);
  assert.throws(() => parseFulfillmentReport(report, []));
  assert.throws(() => parseFulfillmentReport({ ...report, totals: { ...metrics, requests: 2 } }, [id]));
  assert.throws(() => parseFulfillmentReport({ ...report, recipients: ["private@example.invalid"] }, [id]));
});

test("outage, invalid endpoint or production response does not become an empty success", async () => {
  for (const response of [Response.json({ secret: "upstream details" }, { status: 503 }), new Response(null, { status: 302, headers: { location: "https://other.example" } }), Response.json({ ...report, preview: false })]) {
    const result = await fetchFulfillment("private", filters, env, async () => response);
    assert.equal(result.status, "unavailable");
    assert.equal(result.report, null);
    assert.equal(JSON.stringify(result).includes("upstream details"), false);
  }
  let calls = 0;
  const result = await fetchFulfillment("private", filters, { ...env, QR_BOOKS_REPORT_URL: "https://other.vercel.app/api/qr/report" }, async () => { calls++; return Response.json(report); });
  assert.equal(result.status, "unavailable"); assert.equal(calls, 0);
  assert.equal((await fetchFulfillment("supabase", filters, env)).status, "not_configured");
});
