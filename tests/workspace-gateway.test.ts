import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_DESIGN } from "../lib/qr-design";
import { handleWorkspaceGateway, type WorkspaceGatewayDependencies } from "../supabase/functions/workspace-gateway/core";
import { createWorkspaceStore, type WorkspaceStore } from "../supabase/functions/workspace-gateway/store";

const key = "unit-test-only-workspace-bearer-never-deploy-123456789";
const workspaceId = "10000000-0000-4000-8000-000000000001";
const otherWorkspace = "10000000-0000-4000-8000-000000000002";
const codeId = "10000000-0000-4000-8000-000000000011";
const otherCodeId = "10000000-0000-4000-8000-000000000012";
const input = {
  name: "Workspace test", destination: "https://www.mastrabooks.dev/?book=both#claim", event: "Test event", book: "Both books", placement: "Table",
  status: "active" as const, expiresAt: null, design: DEFAULT_DESIGN,
  utm: { enabled: true, source: "event", medium: "qr", campaign: "test-event", content: "table" },
};
function request(body: unknown = { operation: "list", offset: 0 }, bearer = key) {
  return new Request("https://fixture.supabase.co/functions/v1/workspace-gateway", { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function context(overrides: Partial<WorkspaceGatewayDependencies> = {}) {
  let calls = 0;
  const store: WorkspaceStore = {
    list: async () => { calls++; return []; },
    create: async (_scope, fields) => { calls++; return { id: codeId, ...fields }; },
    update: async () => { calls++; return null; },
    delete: async () => { calls++; return false; },
    scans: async () => { calls++; return []; },
  };
  const dependencies: WorkspaceGatewayDependencies = { keyHash: createHash("sha256").update(key).digest("hex"), workspaceId, store, ...overrides };
  return { dependencies, calls: () => calls };
}

test("workspace gateway authenticates its own bearer before any data access", async () => {
  for (const bearer of ["", "bad", "unknown-workspace-key-with-more-than-thirty-two-characters"]) {
    const c = context(); const response = await handleWorkspaceGateway(request(undefined, bearer), c.dependencies);
    assert.equal(response.status, 401); assert.equal(c.calls(), 0);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("workspace gateway fails closed with unsubstituted configuration", async () => {
  for (const overrides of [{ keyHash: "__WORKSPACE_GATEWAY_KEY_SHA256__" }, { workspaceId: "__PRIVATE_WORKSPACE_ID__" }]) {
    const c = context(overrides); assert.equal((await handleWorkspaceGateway(request(), c.dependencies)).status, 503); assert.equal(c.calls(), 0);
  }
  const c = context();
  const get = new Request("https://fixture.invalid", { headers: { Authorization: `Bearer ${key}` } });
  assert.equal((await handleWorkspaceGateway(get, c.dependencies)).status, 405); assert.equal(c.calls(), 0);
});

test("workspace payload rejects caller-selected ownership, identities, unsafe designs and invalid ranges", async () => {
  const invalid = [
    { operation: "list", offset: 0, workspaceId: otherWorkspace },
    { operation: "list", offset: -1 }, { operation: "list", offset: 1 }, { operation: "list", offset: 10_001_000 },
    { operation: "create", input: { ...input, owner_id: codeId } },
    { operation: "create", input: { ...input, private_workspace_id: otherWorkspace } },
    { operation: "create", input: { ...input, destination: "http://169.254.169.254/" } },
    { operation: "create", input: { ...input, design: { ...input.design, logoData: "data:image/svg+xml,<svg onload='bad()'/>" } } },
    { operation: "update", id: codeId, input: { slug: "replacelink01" } },
    { operation: "update", id: codeId, input: {} },
    { operation: "delete", id: "../other" },
    { operation: "scans", offset: 0, since: "2027-01-01T00:00:00Z", until: "2026-01-01T00:00:00Z" },
    { operation: "scans", offset: 0, since: "2024-01-01T00:00:00Z", until: "2026-01-01T00:00:00Z" },
    { operation: "scans", offset: 0, since: "2026-01-01T00:00:00Z", until: "2026-01-02T00:00:00Z", owner_id: codeId },
  ];
  for (const payload of invalid) {
    const c = context(); assert.equal((await handleWorkspaceGateway(request(payload), c.dependencies)).status, 400, JSON.stringify(payload)); assert.equal(c.calls(), 0);
  }
});

test("workspace gateway bounds streamed and declared payloads before data access", async () => {
  for (const responseRequest of [
    request({ operation: "create", input: { ...input, name: "x".repeat(1_600_001) } }),
    new Request("https://fixture.invalid", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Length": "1600001" }, body: "{}" }),
    new Request("https://fixture.invalid", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: "{" }),
  ]) {
    const c = context(); assert.equal((await handleWorkspaceGateway(responseRequest, c.dependencies)).status, 400); assert.equal(c.calls(), 0);
  }
});

test("validated create and patch use the fixed workspace while missing or foreign IDs stay undisclosed", async () => {
  const operations: unknown[] = [];
  const c = context();
  c.dependencies.store.create = async (scope, fields) => { operations.push({ scope, fields }); return { id: codeId, slug: "stablelink01a", ...fields }; };
  c.dependencies.store.update = async (scope, id, fields) => { operations.push({ scope, id, fields }); return id === codeId ? { id, slug: "stablelink01a", ...fields } : null; };
  const created = await handleWorkspaceGateway(request({ operation: "create", input: { ...input, name: "  Saved name  " } }), c.dependencies);
  assert.equal(created.status, 201); assert.equal((await created.json()).code.name, "Saved name");
  const updated = await handleWorkspaceGateway(request({ operation: "update", id: codeId, input: { destination: "https://www.mastrabooks.dev/?updated=1", status: "paused" } }), c.dependencies);
  assert.equal(updated.status, 200); assert.equal((await updated.json()).code.slug, "stablelink01a");
  assert.ok(operations.every(operation => (operation as { scope: string }).scope === workspaceId));
  for (const operation of ["update", "delete"]) {
    const response = await handleWorkspaceGateway(request({ operation, id: otherCodeId, ...(operation === "update" ? { input: { name: "Other" } } : {}) }), c.dependencies);
    assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: "Code not found" });
  }
});

test("Supabase adapter scopes every read and mutation, preserves slug, and keeps scans scoped through their code", async () => {
  const requests: { method: string; url: URL; body: Record<string, unknown> | undefined }[] = [];
  const rows = [
    { id: codeId, slug: "stablelink01a", private_workspace_id: workspaceId, owner_id: null, ...input },
    { id: otherCodeId, slug: "foreignlink2b", private_workspace_id: otherWorkspace, owner_id: null, ...input },
  ];
  const db = createClient("https://fixture.supabase.co", "unit-test-only-not-a-real-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (resource, options) => {
      const url = new URL(String(resource)); const method = options?.method ?? "GET";
      const body = options?.body ? JSON.parse(String(options.body)) : undefined;
      requests.push({ method, url, body });
      const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.pathname.endsWith("qr_studio_scans")) return json([{ id: "scan", code_id: codeId, qr_studio_codes: { private_workspace_id: workspaceId, owner_id: null } }]);
      if (method === "POST") { rows.push(body); return json(body); }
      const matches = rows.filter(row => url.searchParams.get("private_workspace_id") === "eq." + row.private_workspace_id &&
        (!url.searchParams.has("id") || url.searchParams.get("id") === "eq." + row.id));
      if (method === "PATCH") { matches.forEach(row => Object.assign(row, body)); return json(matches[0] ?? null); }
      if (method === "DELETE") return json(matches.map(({ id }) => ({ id })));
      return json(matches);
    } },
  });
  const store = createWorkspaceStore(db);
  assert.equal((await store.list(workspaceId, 1000)).length, 1);
  const created = await store.create(workspaceId, input);
  assert.match(String(created.id), /^[0-9a-f-]{36}$/);
  assert.match(String(created.slug), /^[A-Za-z0-9_-]{12}$/);
  assert.equal(created.owner_id, null); assert.equal(created.private_workspace_id, workspaceId);
  const changed = await store.update(workspaceId, codeId, { destination: "https://www.mastrabooks.dev/?changed=1", status: "paused" });
  assert.equal(changed?.slug, "stablelink01a"); assert.equal(changed?.status, "paused");
  assert.equal(await store.update(workspaceId, otherCodeId, { name: "Unauthorized" }), null);
  assert.equal(await store.delete(workspaceId, otherCodeId), false);
  assert.equal(await store.delete(workspaceId, codeId), true);
  const scans = await store.scans(workspaceId, { offset: 1000, since: "2026-11-01T00:00:00Z", until: "2026-11-18T00:00:00Z", codeId });
  assert.deepEqual(scans, [{ id: "scan", code_id: codeId }]);
  for (const captured of requests) {
    if (captured.method === "POST") continue;
    const prefix = captured.url.pathname.endsWith("qr_studio_scans") ? "qr_studio_codes." : "";
    assert.equal(captured.url.searchParams.get(prefix + "private_workspace_id"), "eq." + workspaceId);
    assert.equal(captured.url.searchParams.get(prefix + "owner_id"), "is.null");
    if (captured.method === "PATCH") {
      for (const immutable of ["id", "slug", "owner_id", "private_workspace_id", "created_at"]) assert.equal(captured.body?.[immutable], undefined);
    }
  }
  const scanRequest = requests.at(-1)!;
  assert.equal(scanRequest.url.searchParams.get("code_id"), "eq." + codeId);
  assert.equal(scanRequest.url.searchParams.get("scanned_at"), "gte.2026-11-01T00:00:00Z");
  assert.equal(scanRequest.url.searchParams.getAll("scanned_at")[1], "lte.2026-11-18T00:00:00Z");
  assert.equal(scanRequest.url.searchParams.get("offset"), "1000");
  assert.equal(scanRequest.url.searchParams.get("limit"), "1000");
});

test("workspace backend errors never expose database detail or credentials", async () => {
  const c = context(); let logged = false;
  c.dependencies.store.list = async () => { throw new Error("private connection detail"); };
  c.dependencies.onError = () => { logged = true; };
  const response = await handleWorkspaceGateway(request(), c.dependencies);
  assert.equal(response.status, 503); assert.equal(logged, true);
  assert.deepEqual(await response.json(), { error: "Workspace service temporarily unavailable" });
});
