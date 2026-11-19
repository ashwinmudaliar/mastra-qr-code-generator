import test from "node:test";
import assert from "node:assert/strict";
import { handleGateway, sha256, redirectDestination, type GatewayCode, type GatewayDependencies } from "../supabase/functions/scan-gateway/core";

const key = "unit-test-only-bearer-not-for-deployment-123456789";
const metadata = { country: "US", region: "CA", city: "San Francisco", device: "Mobile" };
const code: GatewayCode = { id: "fixture-code", destination: "https://www.mastrabooks.dev/?book=both#claim", status: "active", expires_at: null, archived_at: null, event: "AI Engineer 2027", book: "Both", placement: "Book table", utm: { enabled: true, source: "event", medium: "qr", campaign: "ai-engineer-2027", content: "book table" } };
function request(body: unknown = { slug: "abc123def456", count: true, metadata }, bearer = key) {
  return new Request("https://example.supabase.co/functions/v1/scan-gateway", { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function context(overrides: Partial<GatewayDependencies> = {}) {
  let lookups = 0, writes = 0;
  const dependencies: GatewayDependencies = { keyHash: await sha256(key), findCode: async () => { lookups++; return code; }, insertScan: async () => { writes++; }, now: () => Date.parse("2026-11-17T12:00:00Z"), ...overrides };
  return { dependencies, counts: () => ({lookups,writes}) };
}
test("gateway rejects unknown bearer before lookup", async () => {
  const c = await context(); const result = await handleGateway(request(undefined,"wrong-key-that-has-more-than-32-characters"), c.dependencies);
  assert.equal(result.status,401); assert.deepEqual(c.counts(),{lookups:0,writes:0});
});
test("unsubstituted key hash fails closed", async () => {
  const c = await context({keyHash:"__SCAN_GATEWAY_KEY_SHA256__"}); const result=await handleGateway(request(),c.dependencies); assert.equal(result.status,503); assert.equal(c.counts().lookups,0);
});
test("authenticated scan returns destination with preserved query/hash and records bounded metadata", async () => {
  let recorded: unknown;
  const c = await context({insertScan:async(id,meta,visit)=>{recorded={id,meta,visit};}});
  const result=await handleGateway(request(),c.dependencies); assert.equal(result.status,200); assert.equal(result.headers.get("cache-control"),"no-store");
  const body=await result.json(); const url=new URL(body.destination);
  assert.equal(url.searchParams.get("book"),"both");assert.equal(url.searchParams.get("utm_campaign"),"ai-engineer-2027");assert.equal(url.searchParams.get("utm_content"),"book table");assert.equal(url.hash,"#claim");assert.equal(body.recorded,true);
  assert.match(body.attribution.visitId,/^[0-9a-f-]{36}$/);
  assert.deepEqual(body.attribution,{v:1,codeId:code.id,visitId:body.attribution.visitId,visitedAt:"2026-11-17T12:00:00.000Z",event:code.event,book:code.book,placement:code.placement});
  assert.deepEqual(recorded,{id:"fixture-code",meta:metadata,visit:{id:body.attribution.visitId,scannedAt:body.attribution.visitedAt}});
});
test("HEAD/prefetch equivalents resolve without recording", async () => {
  const c=await context();const result=await handleGateway(request({slug:"abc123def456",count:false,metadata}),c.dependencies);assert.equal(result.status,200);const body=await result.json();assert.equal(body.recorded,false);assert.equal(body.attribution,null);assert.deepEqual(c.counts(),{lookups:1,writes:0});
});
test("paused, archived and expired codes never insert scans or disclose destination", async () => {
  for(const variant of [{...code,status:"paused"},{...code,archived_at:"2026-11-17T12:00:00Z"},{...code,expires_at:"2026-11-17T12:00:00Z"}]) {const c=await context({findCode:async()=>variant});const result=await handleGateway(request(),c.dependencies);assert.equal(result.status,410);assert.equal(c.counts().writes,0);assert.equal((await result.json()).destination,undefined);}
});
test("unknown code is 404 without scan writes", async () => {
  const c=await context({findCode:async()=>null});const result=await handleGateway(request(),c.dependencies);assert.equal(result.status,404);assert.equal(c.counts().writes,0);
});
test("invalid and oversized payloads do not query database", async () => {
  for (const body of [{slug:"abc123def456",count:true,metadata:{...metadata,ip:"1.2.3.4"}}, {slug:"../unsafe",count:true,metadata}, {slug:"abc123def456",count:true,metadata:{...metadata,city:"x".repeat(5000)}}, {slug:"abc123def456",count:true,metadata:{...metadata,device:"Spider"}}]) {
    const c=await context();assert.equal((await handleGateway(request(body),c.dependencies)).status,400);assert.deepEqual(c.counts(),{lookups:0,writes:0});
  }
});
test("invalid database destination fails closed before scan write", async () => {
  for(const destination of ["javascript:alert(1)","https://secret@example.com", "http://127.0.0.1/private","http://169.254.169.254/"]) {const c=await context({findCode:async()=>({...code,destination})});assert.equal((await handleGateway(request(),c.dependencies)).status,503);assert.equal(c.counts().writes,0);}
});
test("recording outage preserves destination but reports unrecorded visit", async () => {
  let logged=false;const c=await context({insertScan:async()=>{throw new Error("do not expose this");},onRecordingError:()=>{logged=true;}});const result=await handleGateway(request(),c.dependencies);assert.equal(result.status,200);const body=await result.json();assert.equal(body.recorded,false);assert.equal(body.attribution,null);assert.equal(logged,true);
});
test("disabled UTMs preserve existing destination parameters exactly", () => {
  assert.equal(redirectDestination({...code,utm:{enabled:false,source:"overwrite"}}),code.destination);
});
