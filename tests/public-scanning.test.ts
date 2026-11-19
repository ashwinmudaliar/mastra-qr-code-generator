import test from "node:test";
import assert from "node:assert/strict";
import { publicScanOrigin } from "../lib/server/public-scanning";
import { booksDestination, booksPreviewOrigin } from "../lib/server/attribution";
import { fetchFulfillment } from "../lib/server/fulfillment";

const origin = "https://qr.mastrabooks.dev";
const env = { QR_PUBLIC_SCAN_ORIGIN: origin, NEXT_PUBLIC_QR_SCAN_ORIGIN: origin,
  QR_BOOKS_PREVIEW_ORIGIN: "https://books-review.vercel.app", QR_ATTRIBUTION_SECRET: "test-only-".repeat(5),
  QR_BOOKS_REPORT_URL: "https://books-review.vercel.app/api/qr/report", QR_BOOKS_REPORT_KEY: "test-only-".repeat(5) };

test("public scan config requires matching permanent HTTPS origins", () => {
  assert.equal(publicScanOrigin({}), undefined);
  assert.equal(publicScanOrigin(env), origin);
  for (const value of ["http://qr.mastrabooks.dev", "https://x.vercel.app", `${origin}/q`, `${origin}?x=1`, "https://user@qr.mastrabooks.dev", "https://qr.mastrabooks.dev:444", "https://qr.local"]) {
    assert.throws(() => publicScanOrigin({ QR_PUBLIC_SCAN_ORIGIN: value, NEXT_PUBLIC_QR_SCAN_ORIGIN: value }));
  }
  assert.throws(() => publicScanOrigin({ ...env, NEXT_PUBLIC_QR_SCAN_ORIGIN: "https://other.example.com" }));
});

test("public links do not rewrite Books to preview or sign simulated attribution", async () => {
  const destination = "https://www.mastrabooks.dev/?utm_campaign=launch#books";
  assert.equal(booksPreviewOrigin("private", env), undefined);
  assert.equal(booksDestination(destination, null, "private", env), destination);
  let fetched = false;
  const result = await fetchFulfillment("private", { codeIds: [], from: "2026-01-01", to: "2026-12-31" }, env, async () => {
    fetched = true; throw new Error("Should not fetch synthetic reports");
  });
  assert.equal(fetched, false);
  assert.deepEqual(result, { status: "not_configured", report: null, message: "Live fulfillment reporting is not connected yet." });
});
