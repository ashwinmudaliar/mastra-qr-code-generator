import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { handlePublicScanGateway } from "../supabase/functions/public-scan-gateway/core";
import { sha256 } from "../supabase/functions/scan-gateway/core";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000002";
const foreignId = "10000000-0000-4000-8000-000000000003";
const key = "test-only-public-scan-key-with-more-than-32-characters";
const metadata = { country: "US", region: "CA", city: "San Francisco", device: "Mobile" };
const request = (slug: string, options: { bearer?: string; count?: boolean; extra?: object; query?: string } = {}) => new Request(`https://fixture.supabase.co/functions/v1/public-scan-gateway${options.query ?? ""}`, {
  method: "POST", headers: { Authorization: `Bearer ${options.bearer ?? key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ slug, count: options.count ?? true, metadata, ...options.extra }),
});
const baseRow = { id: "10000000-0000-4000-8000-000000000011", slug: "abc123def456", destination: "https://www.mastrabooks.dev/?book=both#claim", status: "active", archived_at: null as string | null, expires_at: null as string | null, utm: { enabled: true, campaign: "Test" }, event: "Test", book: "Both", placement: "Table", private_workspace_id: null as string | null, owner_id: null as string | null };

// Evaluate the filters sent by the real Supabase client, not a mocked fluent
// adapter. Omitting either scope or its null guard exposes a fixture and fails.
function terms(group: string): string[] {
  let depth = 0; let start = 0; const result: string[] = [];
  for (let index = 0; index < group.length; index++) {
    if (group[index] === "(") depth++;
    if (group[index] === ")") depth--;
    if (group[index] === "," && depth === 0) { result.push(group.slice(start, index)); start = index + 1; }
  }
  assert.equal(depth, 0);
  return [...result, group.slice(start)];
}
function matchesFilter(row: typeof baseRow, filter: string): boolean {
  const group = /^(and|or)\((.*)\)$/.exec(filter);
  if (group) {
    const values = terms(group[2]).map(term => matchesFilter(row, term));
    return group[1] === "and" ? values.every(Boolean) : values.some(Boolean);
  }
  const part = /^(slug|owner_id|private_workspace_id)\.(eq|is)\.(.+)$/.exec(filter);
  assert.ok(part, `Unsupported database filter: ${filter}`);
  const value = row[part[1] as "slug" | "owner_id" | "private_workspace_id"];
  if (part[2] === "is") { assert.equal(part[3], "null"); return value === null; }
  return value === part[3];
}
function database(rows: typeof baseRow[]) {
  const lookups: URL[] = [];
  const scans: Record<string, unknown>[] = [];
  const db = createClient("https://fixture.supabase.co", "test-service-role", { auth: { persistSession: false }, global: { fetch: async (input, options) => {
    const url = new URL(String(input));
    if (url.pathname === "/rest/v1/qr_studio_codes") {
      assert.equal(options?.method, "GET");
      lookups.push(url);
      const filters = [...url.searchParams].filter(([name]) => name !== "select")
        .map(([name, value]) => name === "or" ? `or${value}` : `${name}.${value}`);
      return Response.json(rows.filter(row => filters.every(filter => matchesFilter(row, filter))));
    }
    assert.equal(url.pathname, "/rest/v1/qr_studio_scans");
    assert.equal(options?.method, "POST");
    scans.push(JSON.parse(String(options?.body)));
    return new Response(null, { status: 201 });
  } } });
  return { db, lookups, scans };
}
const scopes = {
  workspace: { scopeMode: "workspace", workspaceId, ownerId: "" },
  transition: { scopeMode: "transition", workspaceId, ownerId },
  owner: { scopeMode: "owner", workspaceId: "", ownerId },
};
const ownerships = [
  { private_workspace_id: workspaceId, owner_id: null },
  { private_workspace_id: null, owner_id: ownerId },
  { private_workspace_id: foreignId, owner_id: null },
  { private_workspace_id: null, owner_id: foreignId },
  { private_workspace_id: workspaceId, owner_id: ownerId },
  { private_workspace_id: null, owner_id: null },
  { private_workspace_id: workspaceId, owner_id: foreignId },
  { private_workspace_id: foreignId, owner_id: ownerId },
];

for (const [mode, scope] of Object.entries(scopes)) {
  test(`${mode} scope permits only its fixed ownership and excludes unrelated or ambiguous rows`, async () => {
    const rows = ownerships.map((ownership, index) => ({ ...baseRow, ...ownership, id: `10000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`, slug: `scope${String(index).padStart(7, "0")}` }));
    const fixture = database(rows);
    const config = { db: fixture.db, keyHash: await sha256(key), ...scope };
    const allowed = mode === "workspace" ? [0] : mode === "owner" ? [1] : [0, 1];
    for (const [index, row] of rows.entries()) {
      const response = await handlePublicScanGateway(request(row.slug), config);
      assert.equal(response.status, allowed.includes(index) ? 200 : 404, `row ${index}`);
      assert.equal(fixture.lookups[index].searchParams.get("slug"), `eq.${row.slug}`);
    }
    assert.deepEqual(fixture.scans.map(scan => scan.code_id), allowed.map(index => rows[index].id));
    assert.equal((await handlePublicScanGateway(request("unknown12345"), config)).status, 404);
    const query = fixture.lookups[0].searchParams;
    if (mode === "transition") {
      assert.equal(query.get("or"), `(and(private_workspace_id.eq.${workspaceId},owner_id.is.null),and(owner_id.eq.${ownerId},private_workspace_id.is.null))`);
    } else {
      assert.equal(query.get(mode === "workspace" ? "private_workspace_id" : "owner_id"), `eq.${mode === "workspace" ? workspaceId : ownerId}`);
      assert.equal(query.get(mode === "workspace" ? "owner_id" : "private_workspace_id"), "is.null");
      assert.equal(query.get("or"), null);
    }
  });
}

test("invalid fixed configuration and bearer fail closed before database access", async () => {
  const fixture = database([]);
  const config = { db: fixture.db, keyHash: await sha256(key), ...scopes.transition };
  const badScopes = [
    { ...scopes.transition, scopeMode: "__PUBLIC_SCAN_SCOPE_MODE__" },
    { ...scopes.transition, scopeMode: "all" },
    { ...scopes.transition, ownerId: "__PUBLIC_SCAN_OWNER_ID__" },
    { ...scopes.transition, workspaceId: "__PUBLIC_SCAN_WORKSPACE_ID__" },
    { ...scopes.transition, ownerId: `${ownerId},private_workspace_id.is.null` },
    { ...scopes.transition, ownerId: "" },
    { ...scopes.transition, workspaceId: "" },
    { ...scopes.owner, workspaceId },
    { ...scopes.workspace, ownerId },
    { ...scopes.owner, workspaceId: "__PUBLIC_SCAN_WORKSPACE_ID__" },
    { ...scopes.workspace, ownerId: "__PUBLIC_SCAN_OWNER_ID__" },
  ];
  for (const scope of badScopes) assert.equal((await handlePublicScanGateway(request(baseRow.slug), { ...config, ...scope })).status, 503);
  assert.equal((await handlePublicScanGateway(request(baseRow.slug), { ...config, keyHash: "__PUBLIC_SCAN_GATEWAY_KEY_SHA256__" })).status, 503);
  assert.equal((await handlePublicScanGateway(request(baseRow.slug, { bearer: "wrong-key-with-more-than-32-characters" }), config)).status, 401);
  assert.deepEqual(fixture.lookups, []);
  assert.deepEqual(fixture.scans, []);
});

test("request body and query cannot choose the gateway's owner or workspace", async () => {
  const fixture = database([{ ...baseRow, owner_id: foreignId }]);
  const config = { db: fixture.db, keyHash: await sha256(key), ...scopes.owner };
  for (const extra of [{ ownerId: foreignId }, { workspaceId }, { scopeMode: "workspace" }]) {
    assert.equal((await handlePublicScanGateway(request(baseRow.slug, { extra }), config)).status, 400);
  }
  assert.equal(fixture.lookups.length, 0);
  assert.equal((await handlePublicScanGateway(request(baseRow.slug, { query: `?ownerId=${foreignId}&workspaceId=${workspaceId}&scopeMode=transition` }), config)).status, 404);
  assert.equal(fixture.lookups[0].searchParams.get("owner_id"), `eq.${ownerId}`);
  assert.deepEqual(fixture.scans, []);
});

test("owner-scoped scans preserve destination, UTM, count exclusions, and availability checks", async () => {
  const row = { ...baseRow, owner_id: ownerId };
  const fixture = database([row]);
  const config = { db: fixture.db, keyHash: await sha256(key), ...scopes.owner };
  const response = await handlePublicScanGateway(request(row.slug), config);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.destination, "https://www.mastrabooks.dev/?book=both&utm_campaign=Test#claim");
  assert.equal(result.recorded, true);
  assert.equal(result.attribution.codeId, row.id);
  assert.deepEqual(Object.keys(fixture.scans[0]).sort(), ["id", "scanned_at", "code_id", "country", "region", "city", "device"].sort());
  const uncounted = await handlePublicScanGateway(request(row.slug, { count: false }), config);
  assert.equal((await uncounted.json()).recorded, false);
  assert.equal(fixture.scans.length, 1);

  for (const change of [{ archived_at: "2026-01-01T00:00:00.000Z" }, { status: "paused" }, { expires_at: "2000-01-01T00:00:00.000Z" }]) {
    const unavailable = database([{ ...row, ...change }]);
    assert.equal((await handlePublicScanGateway(request(row.slug), { ...config, db: unavailable.db })).status, 410);
    assert.deepEqual(unavailable.scans, []);
  }
});
