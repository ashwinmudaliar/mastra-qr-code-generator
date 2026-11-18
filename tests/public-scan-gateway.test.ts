import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { handlePublicScanGateway } from "../supabase/functions/public-scan-gateway/core";
import { sha256 } from "../supabase/functions/scan-gateway/core";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const key = "test-only-public-scan-key-with-more-than-32-characters";
const metadata = { country: "US", region: "CA", city: "San Francisco", device: "Mobile" };
const request = (slug = "abc123def456", bearer = key) => new Request("https://fixture.supabase.co/functions/v1/public-scan-gateway", {
  method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
  body: JSON.stringify({ slug, count: true, metadata }),
});
const row = { id: "10000000-0000-4000-8000-000000000011", destination: "https://www.mastrabooks.dev/", status: "active", archived_at: null, expires_at: null, utm: {}, event: "Test", book: "Both", placement: "Table" };

test("public gateway scopes actual database lookups to its fixed workspace", async () => {
  const calls: string[] = [];
  const db = createClient("https://fixture.supabase.co", "test-service-role", { global: { fetch: async (input, options) => {
    const url = new URL(String(input)); calls.push(url.pathname);
    if (url.pathname.endsWith("/qr_studio_codes")) {
      assert.equal(url.searchParams.get("private_workspace_id"), `eq.${workspaceId}`);
      assert.equal(url.searchParams.get("owner_id"), "is.null");
      const known = url.searchParams.get("slug") === "eq.abc123def456";
      return Response.json(known ? row : null);
    }
    assert.ok(url.pathname.endsWith("/qr_studio_scans"));
    const scan = JSON.parse(String(options?.body));
    assert.equal(scan.code_id, row.id); assert.equal(scan.device, "Mobile");
    assert.equal(scan.ip, undefined); return new Response(null, { status: 201 });
  } } });
  const config = { db, keyHash: await sha256(key), workspaceId };
  assert.equal((await handlePublicScanGateway(request(), config)).status, 200);
  assert.deepEqual(calls, ["/rest/v1/qr_studio_codes", "/rest/v1/qr_studio_scans"]);
  calls.length = 0;
  assert.equal((await handlePublicScanGateway(request("foreign12345"), config)).status, 404);
  assert.deepEqual(calls, ["/rest/v1/qr_studio_codes"]);
  calls.length = 0;
  assert.equal((await handlePublicScanGateway(request(undefined, "incorrect-key-with-more-than-32-characters"), config)).status, 401);
  assert.equal((await handlePublicScanGateway(request(), { ...config, workspaceId: "__PUBLIC_SCAN_WORKSPACE_ID__" })).status, 503);
  assert.deepEqual(calls, []);
});
