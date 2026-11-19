import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { booksDestination, booksPreviewOrigin, signAttribution } from "../lib/server/attribution";

const secret = "unit-test-only-attribution-secret-with-32-characters";
const ref = () => ({ v: 1, codeId: "11111111-1111-4111-8111-111111111111", visitId: "22222222-2222-4222-8222-222222222222", visitedAt: new Date().toISOString(), event: "Conference", book: "Both", placement: "Book table" });
const env = { QR_ATTRIBUTION_SECRET: secret, QR_BOOKS_PREVIEW_ORIGIN: "https://books-private.vercel.app" };

test("signed visit points to private Books with original parameters and fragment intact", () => {
  const attribution = ref();
  const destination = new URL(booksDestination("https://www.mastrabooks.dev/?book=both&utm_source=event#claim", attribution, "private", env));
  assert.equal(destination.origin, env.QR_BOOKS_PREVIEW_ORIGIN);
  assert.equal(destination.searchParams.get("book"), "both");
  assert.equal(destination.searchParams.get("utm_source"), "event");
  assert.equal(destination.hash, "#claim");
  const [payload, signature] = destination.searchParams.get("qr_ref")!.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url").toString()), attribution);
  assert.equal(signature, createHmac("sha256", secret).update(payload).digest("base64url"));
});

test("invalid or unrecorded attribution never blocks redirect or reuses a pasted visit", () => {
  for (const attribution of [null, { ...ref(), visitId: "invented" }, { ...ref(), visitedAt: "invalid" }]) {
    const url = new URL(booksDestination("https://mastrabooks.dev/?qr_ref=stale&book=both", attribution, "private", env));
    assert.equal(url.origin, env.QR_BOOKS_PREVIEW_ORIGIN);
    assert.equal(url.searchParams.has("qr_ref"), false);
    assert.equal(url.searchParams.get("book"), "both");
  }
  assert.equal(signAttribution(ref(), "short"), null);
  assert.equal(signAttribution({ ...ref(), visitedAt: "2020-01-01T00:00:00.000Z" }, secret), null);
  assert.equal(signAttribution({ ...ref(), visitedAt: new Date(Date.now() + 120_000).toISOString() }, secret), null);
  assert.equal(signAttribution({ ...ref(), email: "should-not-be-in-url@example.invalid" }, secret), null);
});

test("separate intake routes and unrelated origins are not rewritten or attributed", () => {
  for (const destination of ["https://mastrabooks.dev/agents-in-prod", "https://mastrabooks.dev/mlh", "https://mastrabooks.dev/cards", "https://mastrabooks.dev.evil.test/", "https://mastrabooks.dev:8443/", "https://other.example/", "http://mastrabooks.dev/"]) {
    assert.equal(booksDestination(destination, ref(), "private", env), destination);
  }
  const destination = "https://mastrabooks.dev/?existing=yes";
  assert.equal(booksDestination(destination, ref(), "supabase", env), destination);
});

test("preview origin accepts only server-configured HTTPS Vercel or explicit local development", () => {
  for (const origin of ["https://books.example/", "https://books.vercel.app/path", "https://books.vercel.app/?secret=x", "https://user:pass@books.vercel.app", "https://books.vercel.app.evil.test", "http://localhost:3000"]) {
    assert.equal(booksPreviewOrigin("private", { QR_BOOKS_PREVIEW_ORIGIN: origin }), undefined);
  }
  const local = { NODE_ENV: "development", QR_LOCAL_PREVIEW: "1", QR_BOOKS_PREVIEW_ORIGIN: "http://127.0.0.1:3150" };
  assert.equal(booksPreviewOrigin("local", local), "http://127.0.0.1:3150");
  assert.equal(booksPreviewOrigin("local", { ...local, NODE_ENV: "production" }), undefined);
  assert.equal(booksPreviewOrigin("supabase", env), undefined);
});
