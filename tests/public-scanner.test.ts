import assert from "node:assert/strict";
import test from "node:test";
import { handleScan, SUPABASE_PROJECT_ORIGIN, type ScannerDependencies } from "../scanner/lib/handler";

const key = "unit-test-public-scan-bearer-not-a-live-secret-123456789";
const origin = "https://qr.mastrabooks.dev";
const slug = "abc123def456";
const destination = "https://www.mastrabooks.dev/?book=both&utm_campaign=example#claim";
const env = { SUPABASE_URL: SUPABASE_PROJECT_ORIGIN, QR_PUBLIC_SCAN_GATEWAY_KEY: key, VERCEL: "1" };
function request(path = `/q/${slug}`, init: RequestInit = {}) {
  return new Request(`${origin}${path}`, { ...init, headers: { "user-agent": "Mozilla/5.0 (iPhone; Mobile)", ...init.headers } });
}
function gateway(body: unknown = { destination, recorded: true }, status = 200) {
  const calls: { url: string; init: RequestInit; payload: Record<string, unknown> }[] = [];
  const failures: string[] = [];
  const dependencies: ScannerDependencies = {
    env,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {}, payload: JSON.parse(String(init?.body)) });
      return Response.json(body, { status });
    },
    onFailure: reason => failures.push(reason),
  };
  return { dependencies, calls, failures };
}

test("public scanner exposes no management, source, function, or alternate slug paths", async () => {
  const fixture = gateway();
  for (const path of ["/", "/api/session", "/api/codes", "/api/analytics", "/auth/callback", "/api/index", `/api/index?slug=${slug}`,
    `/q/${slug}/`, "/q/short", `/q/${slug}/extra`, "/q/abc123def45%36", "/lib/handler.ts", "/package.json"]) {
    const response = await handleScan(request(path), fixture.dependencies);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("location"), null);
  }
  assert.equal(fixture.calls.length, 0, "Rejected paths must not reach storage");
});

test("only the pathname chooses the slug; queries and forwarded headers are ignored", async () => {
  const fixture = gateway();
  const response = await handleScan(request(`/q/${slug}?slug=another-code&path=/api/codes`, {
    headers: { "x-forwarded-uri": "/api/codes", "x-original-url": "/api/codes" },
  }), fixture.dependencies);
  assert.equal(response.status, 302);
  assert.equal(fixture.calls[0].payload.slug, slug);
  assert.equal(response.headers.get("location"), destination);
});

test("unsupported methods and the unsaved draft never contact the gateway", async () => {
  const fixture = gateway();
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await handleScan(request(undefined, { method }), fixture.dependencies);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
  }
  const draft = await handleScan(request("/q/draftpreview"), fixture.dependencies);
  assert.equal(draft.status, 404);
  assert.match(await draft.text(), /printed from an unsaved preview/);
  assert.equal(fixture.calls.length, 0);
});

test("missing credentials or a different gateway project fail closed before fetch", async () => {
  for (const badEnv of [{}, { ...env, QR_PUBLIC_SCAN_GATEWAY_KEY: "short" },
    { ...env, QR_PUBLIC_SCAN_GATEWAY_KEY: `${key}\n` },
    { ...env, SUPABASE_URL: "https://attacker.example" },
    { ...env, SUPABASE_URL: `${SUPABASE_PROJECT_ORIGIN}/unexpected` },
    { ...env, SUPABASE_URL: `${SUPABASE_PROJECT_ORIGIN}?redirect=https://attacker.example` },
    { ...env, SUPABASE_URL: SUPABASE_PROJECT_ORIGIN.replace("https:", "http:") }]) {
    const fixture = gateway();
    const response = await handleScan(request(), { ...fixture.dependencies, env: badEnv });
    assert.equal(response.status, 503);
    assert.equal(fixture.calls.length, 0);
    assert.deepEqual(fixture.failures, ["configuration"]);
    assert.doesNotMatch(await response.text(), /attacker|bearer|supabase/);
  }
});

test("a real GET sends only coarse metadata to the fixed authenticated gateway", async () => {
  const fixture = gateway({ destination, recorded: true, attribution: { privateField: "not-browser-data" } });
  const response = await handleScan(request(undefined, { headers: {
    "user-agent": "Mozilla/5.0 (iPhone; Mobile)",
    "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA", "x-vercel-ip-city": "San%20Francisco",
    "x-real-ip": "192.0.2.1", "authorization": "Bearer do-not-forward", "cookie": "session=do-not-forward",
  } }), fixture.dependencies);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), destination);
  assert.equal(await response.text(), "", "No gateway metadata may be exposed");
  assert.equal(fixture.calls[0].url, `${SUPABASE_PROJECT_ORIGIN}/functions/v1/public-scan-gateway`);
  assert.deepEqual(fixture.calls[0].payload, { slug, count: true, metadata: { country: "US", region: "CA", city: "San Francisco", device: "Mobile" } });
  const options = fixture.calls[0].init;
  assert.equal(options.method, "POST");
  assert.equal(options.redirect, "error");
  assert.equal(options.cache, "no-store");
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(options.headers, { "Content-Type": "application/json", Authorization: `Bearer ${key}` });
  for (const header of ["set-cookie", "authorization", "access-control-allow-origin"]) assert.equal(response.headers.get(header), null);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("HEAD, bot and prefetch requests resolve without recording a visit", async () => {
  const requests: RequestInit[] = [{ method: "HEAD" }, { headers: { "user-agent": "Googlebot" } },
    { headers: { "user-agent": "facebookexternalhit/1.1" } }, { headers: { "next-router-prefetch": "1" } },
    { headers: { purpose: "prefetch" } }, { headers: { "sec-purpose": "prefetch;prerender" } }];
  for (const init of requests) {
    const fixture = gateway();
    const response = await handleScan(request(undefined, init), fixture.dependencies);
    assert.equal(response.status, 302);
    assert.equal(fixture.calls[0].payload.count, false);
    assert.equal(await response.text(), "");
  }
});

test("repeated ordinary visits still count separately", async () => {
  const fixture = gateway();
  await handleScan(request(), fixture.dependencies);
  await handleScan(request(), fixture.dependencies);
  assert.deepEqual(fixture.calls.map(call => call.payload.count), [true, true]);
});

test("geography is sanitized and bounded, and is not trusted outside Vercel", async () => {
  const fixture = gateway();
  const incoming = request(undefined, { headers: {
    "x-vercel-ip-country": "%00US%7F", "x-vercel-ip-country-region": "%invalid",
    "x-vercel-ip-city": "x".repeat(300), "user-agent": "Mozilla/5.0 (iPad; Tablet)",
  } });
  await handleScan(incoming, fixture.dependencies);
  assert.deepEqual(fixture.calls[0].payload.metadata, { country: "US", region: "Unknown", city: "x".repeat(120), device: "Tablet" });
  await handleScan(incoming, { ...fixture.dependencies, env: { ...env, VERCEL: undefined } });
  assert.deepEqual(fixture.calls[1].payload.metadata, { country: "Unknown", region: "Unknown", city: "Unknown", device: "Tablet" });
});

test("gateway 404 and 410 keep their status without disclosing gateway responses", async () => {
  for (const status of [404, 410]) {
    const fixture = gateway({ destination, secret: "not-browser-data" }, status);
    const response = await handleScan(request(), fixture.dependencies);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("location"), null);
    assert.doesNotMatch(await response.text(), /not-browser-data|utm_campaign/);
    const head = await handleScan(request(undefined, { method: "HEAD" }), fixture.dependencies);
    assert.equal(head.status, status);
    assert.equal(await head.text(), "");
  }
});

test("a storage recording outage still redirects and never exposes its metadata", async () => {
  const fixture = gateway({ destination, recorded: false, attribution: null });
  const response = await handleScan(request(), fixture.dependencies);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), destination);
  assert.deepEqual(fixture.failures, []);
});

test("gateway errors, timeouts and invalid JSON return a generic uncached 503", async () => {
  const fetches: NonNullable<ScannerDependencies["fetch"]>[] = [
    async () => Response.json({ secret: "not-browser-data" }, { status: 401 }),
    async () => Response.json({ secret: "not-browser-data" }, { status: 500 }),
    async () => { throw new DOMException("not-browser-data", "TimeoutError"); },
    async () => new Response("not valid JSON: not-browser-data"),
    async () => new Response(null, { status: 302, headers: { location: "https://attacker.example" } }),
  ];
  for (const fetch of fetches) {
    const fixture = gateway();
    const response = await handleScan(request(), { ...fixture.dependencies, fetch });
    assert.equal(response.status, 503);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal(response.headers.get("location"), null);
    assert.doesNotMatch(await response.text(), /not-browser-data|attacker/);
    assert.deepEqual(fixture.failures, ["gateway"]);
  }
});

test("invalid gateway destinations cannot become redirects", async () => {
  for (const value of [null, {}, { destination: 7 }, { destination: "javascript:alert(1)" },
    { destination: "https://user:pass@example.com/" }, { destination: "http://127.0.0.1/private" },
    { destination: "http://169.254.169.254/" }, { destination: "https://example.local/" },
    { destination: "https://www.mastrabooks.dev/\nspoof" }, { destination: `https://example.com/${"x".repeat(4096)}` }]) {
    const fixture = gateway(value);
    const response = await handleScan(request(), fixture.dependencies);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("location"), null);
  }
});

test("oversized gateway responses fail closed with or without content length", async () => {
  for (const declared of [true, false]) {
    let cancelled = false;
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(16_385))); },
      cancel() { cancelled = true; },
    }), { headers: declared ? { "content-length": "16385" } : {} });
    const result = await handleScan(request(), { env, fetch: async () => response });
    assert.equal(result.status, 503);
    assert.equal(cancelled, true);
  }
});
