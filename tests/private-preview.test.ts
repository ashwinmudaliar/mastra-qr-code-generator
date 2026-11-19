import assert from "node:assert/strict";
import test from "node:test";
import { isPrivatePreview } from "../lib/server/private-preview";

const env = { QR_PRIVATE_PREVIEW:"1", VERCEL:"1", VERCEL_ENV:"preview", VERCEL_URL:"studio-review.vercel.app", QR_WORKSPACE_GATEWAY_KEY:"x".repeat(43), NEXT_PUBLIC_SUPABASE_URL:"https://project.supabase.co" };
const request = new Request("https://studio-review.vercel.app/api/codes");
test("account-free workspace only activates for its enabled Vercel preview", () => {
  assert.equal(isPrivatePreview(request, env), true);
  assert.equal(isPrivatePreview(request, {...env,QR_PRIVATE_PREVIEW:undefined}), false);
  for (const invalid of [{VERCEL:undefined},{VERCEL_ENV:"production"},{VERCEL_ENV:"development"},{VERCEL_URL:undefined},{QR_WORKSPACE_GATEWAY_KEY:undefined},{QR_WORKSPACE_GATEWAY_KEY:"short"},{NEXT_PUBLIC_SUPABASE_URL:undefined}]) {
    assert.throws(()=>isPrivatePreview(request,{...env,...invalid}));
  }
});
test("workspace mode rejects alternate hosts and spoofed forwarded hosts", () => {
  for(const url of ["http://localhost:3147/api/codes","https://other.vercel.app/api/codes","https://studio.example.com/api/codes"]) {
    assert.throws(()=>isPrivatePreview(new Request(url,{headers:{"x-forwarded-host":env.VERCEL_URL,"host":env.VERCEL_URL}}),env));
  }
});
