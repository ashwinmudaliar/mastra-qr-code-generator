import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { assertGoogleRequestOrigin, assertGoogleUser, completeGoogleLogin, googleLoginConfig } from "../lib/server/google-auth";
import { POST as passwordLogin } from "../app/api/auth/login/route";
import { POST as passwordSignup } from "../app/api/auth/signup/route";
import { POST as googleStart } from "../app/api/auth/google/route";
import { POST as logout } from "../app/api/auth/logout/route";
import { getContext } from "../lib/server/context";

const env = { QR_GOOGLE_LOGIN: "1", QR_ADMIN_EMAILS: "ashwin@mastra.ai", QR_STUDIO_ORIGIN: "https://studio.example.com" };
const config = googleLoginConfig(env);
const allowed = {
  id: "owner", email: "ashwin@mastra.ai", email_confirmed_at: "2026-11-19T00:00:00Z",
  identities: [{ provider: "google" }], app_metadata: {}, user_metadata: {},
} as User;

test("Google access fails closed without an exact email list and a fixed HTTPS root", () => {
  for (const patch of [
    { QR_ADMIN_EMAILS: "" }, { QR_ADMIN_EMAILS: "@mastra.ai" }, { QR_ADMIN_EMAILS: "*@mastra.ai" },
    { QR_STUDIO_ORIGIN: "" }, { QR_STUDIO_ORIGIN: "http://studio.example.com" },
    { QR_STUDIO_ORIGIN: "https://studio.example.com/path" }, { QR_STUDIO_ORIGIN: "https://user@studio.example.com" },
    { QR_STUDIO_ORIGIN: "https://studio.example.com?next=evil" }, { QR_STUDIO_ORIGIN: "https://studio.example.com/#fragment" },
    { QR_STUDIO_ORIGIN: "https://studio.example.com:444" }, { QR_PRIVATE_PREVIEW: "1" }, { QR_LOCAL_PREVIEW: "1" },
  ]) assert.throws(() => googleLoginConfig({ ...env, ...patch }), { status: 503 });
  assert.deepEqual(googleLoginConfig({ ...env, QR_ADMIN_EMAILS: " ASHWIN@MASTRA.AI " }), config);
});

test("OAuth start requires the fixed request origin and browser Origin, without trusting forwarded headers", () => {
  assert.doesNotThrow(() => assertGoogleRequestOrigin(new Request(`${config.origin}/api/auth/google`, { headers: { Origin: config.origin } }), config));
  for (const request of [
    new Request(`${config.origin}/api/auth/google`),
    new Request(`${config.origin}/api/auth/google`, { headers: { Origin: "https://evil.example" } }),
    new Request(`${config.origin}/api/auth/google`, { headers: { Origin: config.origin, "Sec-Fetch-Site": "cross-site" } }),
    new Request("https://evil.example/api/auth/google", { headers: { Origin: config.origin, Host: "studio.example.com", "X-Forwarded-Host": "studio.example.com" } }),
  ]) assert.throws(() => assertGoogleRequestOrigin(request, config), { status: 403 });
});

test("access checks the verified email and real Google identity, never editable user metadata", () => {
  assert.doesNotThrow(() => assertGoogleUser(allowed, config));
  assert.doesNotThrow(() => assertGoogleUser({ ...allowed, email: "ASHWIN@MASTRA.AI" }, config));
  for (const user of [
    { ...allowed, email: "someone@mastra.ai" }, { ...allowed, email: "ashwin@mastra.ai.evil.example" },
    { ...allowed, email_confirmed_at: undefined }, { ...allowed, email: undefined },
    { ...allowed, identities: [], user_metadata: { provider: "google", email: allowed.email } },
    { ...allowed, email: "intruder@example.com", user_metadata: { email: allowed.email, role: "admin" } },
  ]) assert.throws(() => assertGoogleUser(user, config), { status: 403 });
});

function authDouble(user: User | null, exchangeError = false, userError = false) {
  const calls: unknown[] = [];
  const auth = {
    exchangeCodeForSession: async (code: string) => { calls.push(["exchange", code]); return { error: exchangeError ? new Error("invalid code") : null }; },
    getUser: async () => { calls.push(["getUser"]); return { data: { user }, error: userError ? new Error("invalid session") : null }; },
    signOut: async (options: unknown) => { calls.push(["signOut", options]); return { error: null }; },
  } as unknown as Pick<SupabaseClient["auth"], "exchangeCodeForSession" | "getUser" | "signOut">;
  return { auth, calls };
}

test("callback exchanges PKCE then verifies the user; ignores open-redirect parameters", async () => {
  const { auth, calls } = authDouble(allowed);
  const response = await completeGoogleLogin(new Request(`${config.origin}/auth/callback?code=one-use-code&next=https://evil.example&returnTo=//evil.example`), auth, config);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${config.origin}/`);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(calls, [["exchange", "one-use-code"], ["getUser"]]);
});

test("callback signs unauthorized and unverified accounts out before denying access", async () => {
  for (const user of [{ ...allowed, email: "someone@mastra.ai" }, { ...allowed, identities: [] }, null]) {
    const { auth, calls } = authDouble(user);
    const response = await completeGoogleLogin(new Request(`${config.origin}/auth/callback?code=valid`), auth, config);
    assert.equal(response.headers.get("location"), `${config.origin}/?auth=denied`);
    assert.deepEqual(calls, [["exchange", "valid"], ["getUser"], ["signOut", { scope: "local" }]]);
  }
  const { auth, calls } = authDouble(allowed, false, true);
  const response = await completeGoogleLogin(new Request(`${config.origin}/auth/callback?code=valid`), auth, config);
  assert.equal(response.headers.get("location"), `${config.origin}/?auth=denied`);
  assert.equal(calls.length, 3);
});

test("failed or cross-host callbacks never establish access", async () => {
  for (const query of ["", "?error=access_denied&code=bad", `?code=${"x".repeat(2049)}`]) {
    const { auth, calls } = authDouble(allowed);
    const response = await completeGoogleLogin(new Request(`${config.origin}/auth/callback${query}`), auth, config);
    assert.equal(response.headers.get("location"), `${config.origin}/?auth=failed`);
    assert.deepEqual(calls, []);
  }
  const { auth, calls } = authDouble(allowed, true);
  assert.equal((await completeGoogleLogin(new Request(`${config.origin}/auth/callback?code=expired`), auth, config)).headers.get("location"), `${config.origin}/?auth=failed`);
  assert.deepEqual(calls, [["exchange", "expired"]]);
  await assert.rejects(completeGoogleLogin(new Request("https://evil.example/auth/callback?code=valid"), auth, config), { status: 403 });
});

test("Google mode disables password routes and rejects invalid setup before reading cookies", async () => {
  const keys = [...Object.keys(env), "QR_PRIVATE_PREVIEW", "QR_LOCAL_PREVIEW"];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, env);
    delete process.env.QR_PRIVATE_PREVIEW; delete process.env.QR_LOCAL_PREVIEW;
    for (const handler of [passwordLogin, passwordSignup]) {
      const result = await handler(new Request(`${config.origin}/api/auth/login`, { method: "POST", headers: { Origin: config.origin }, body: "{}" }));
      assert.equal(result.status, 403);
      assert.match((await result.json()).error, /Use Google/);
    }
    const result = await googleStart(new Request(`${config.origin}/api/auth/google`, { method: "POST", headers: { Origin: "https://evil.example" } }));
    assert.equal(result.status, 403);
    for (const request of [
      new Request(`${config.origin}/api/auth/logout`, { method: "POST" }),
      new Request("https://evil.example/api/auth/logout", { method: "POST", headers: { Origin: config.origin, Host: "studio.example.com", "X-Forwarded-Host": "studio.example.com" } }),
    ]) assert.equal((await logout(request)).status, 403);
    process.env.QR_ADMIN_EMAILS = "";
    await assert.rejects(getContext(new Request(`${config.origin}/api/codes`)), { status: 503 });
    assert.equal((await logout(new Request(`${config.origin}/api/auth/logout`, { method: "POST", headers: { Origin: config.origin } }))).status, 503);
  } finally {
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
