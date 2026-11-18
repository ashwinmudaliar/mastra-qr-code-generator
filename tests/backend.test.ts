import assert from "node:assert/strict";
import test from "node:test";
import { aggregateAnalytics, destinationWithUTM, deviceFromUserAgent, isAvailable, scanMetadata, shouldCountVisit } from "../lib/server/analytics";
import { codeInputSchema, codePatchSchema, normalizeDestination, parseInput, assertSameOrigin } from "../lib/server/validation";
import { DEFAULT_DESIGN } from "../lib/qr-design";
import type { QRCodeRecord, ScanRecord } from "../lib/types";

const code:QRCodeRecord={id:"a",slug:"abcdefghijkl",name:"Books at Summit",destination:"https://www.mastrabooks.dev/?edition=2#books",event:"Summit",book:"Principles",placement:"Booth",status:"active",expiresAt:null,archivedAt:null,createdAt:"2027-01-01T00:00:00Z",updatedAt:"2027-01-01T00:00:00Z",scans:0,design:DEFAULT_DESIGN,utm:{enabled:true,source:"event",medium:"qr",campaign:"summit 2027",content:"principles"}};
const scan=(id:string,time:string,country="US",codeId="a"):ScanRecord=>({id,codeId,scannedAt:time,country,region:"CA",city:"San Francisco",device:"Mobile"});
test("UTM attribution preserves existing query and hash and safely encodes campaign",()=>{
  const url=new URL(destinationWithUTM(code.destination,code.utm));
  assert.equal(url.searchParams.get("edition"),"2");assert.equal(url.hash,"#books");
  assert.equal(url.searchParams.get("utm_campaign"),"summit 2027");
  assert.equal(destinationWithUTM(code.destination,{...code.utm,enabled:false}),code.destination);
});
test("pause, archive and expiration stop redirects",()=>{
  assert.equal(isAvailable(code,Date.parse("2027-02-01")),true);
  assert.equal(isAvailable({...code,status:"paused"}),false);
  assert.equal(isAvailable({...code,archivedAt:"2027-01-01T00:00:00Z"}),false);
  assert.equal(isAvailable({...code,expiresAt:"2027-01-01T00:00:00Z"},Date.parse("2027-01-01")),false);
});
test("only public web destinations are accepted",()=>{
  for(const bad of ["javascript:alert(1)","data:text/html,x","https://user:pw@example.com","http://127.0.0.1/admin","http://localhost","http://10.0.0.1","http://[::1]"])assert.throws(()=>normalizeDestination(bad));
  assert.equal(normalizeDestination("https://www.mastrabooks.dev"),"https://www.mastrabooks.dev/");
});
test("schema rejects injected owner, script logos, malformed status and invalid expiry",()=>{
  const{ id,slug,createdAt,updatedAt,scans,archivedAt,...input}=code;
  assert.equal(parseInput(codeInputSchema,input).name,code.name);
  for(const extra of [{owner_id:"someone-else"},{archivedAt:null},{archived_at:null},{status:"deleted"},{expiresAt:"never"},{design:{...DEFAULT_DESIGN,logoData:"data:image/svg+xml;base64,PHN2Zz4="}}])assert.throws(()=>parseInput(codeInputSchema,{...input,...extra}));
  assert.deepEqual(parseInput(codePatchSchema,{status:"paused"}),{status:"paused"});
  assert.throws(()=>parseInput(codePatchSchema,{}));
});
test("geography is ignored off Vercel and decoded without retaining IP addresses",()=>{
  const req=new Request("http://localhost/q/abcdefghijkl",{headers:{"x-vercel-ip-country":"US","x-vercel-ip-city":"San%20Francisco","x-forwarded-for":"1.2.3.4","user-agent":"Mozilla/5.0 (iPhone) Mobile"}});
  assert.equal(scanMetadata(req,false).country,"Unknown");
  const meta=scanMetadata(req,true);assert.equal(meta.city,"San Francisco");assert.equal(meta.device,"Mobile");assert.equal(Object.values(meta).includes("1.2.3.4"),false);
});
test("HEAD, bot, and prefetch traffic are excluded from scan count",()=>{
  assert.equal(shouldCountVisit(new Request("https://example.com",{method:"HEAD"})),false);
  assert.equal(shouldCountVisit(new Request("https://example.com",{headers:{"user-agent":"Googlebot"}})),false);
  assert.equal(shouldCountVisit(new Request("https://example.com",{headers:{purpose:"prefetch"}})),false);
  assert.equal(shouldCountVisit(new Request("https://example.com",{headers:{"user-agent":"iPhone Mobile"}})),true);
  assert.equal(deviceFromUserAgent("Mozilla Android tablet"),"Tablet");
});
test("analytics includes UTC boundary, excludes other-owner and old/future rows, fills missing days",()=>{
  const report=aggregateAnalytics([code],[scan("old","2027-01-01T00:00:00Z"),scan("a","2027-01-02T00:00:00Z"),scan("b","2027-01-03T10:00:00Z","Unknown"),scan("future","2027-01-04T00:00:00Z"),scan("foreign","2027-01-03T00:00:00Z","US","unowned")],2,new Date("2027-01-03T12:00:00Z"));
  assert.equal(report.totalScans,2);assert.equal(report.countries,1);assert.equal(report.activeCodes,1);
  assert.deepEqual(report.byDay,[{date:"2027-01-02",scans:1},{date:"2027-01-03",scans:1}]);
  assert.equal(report.recent[0].id,"b");assert.equal(report.byCode[0].scans,2);
});
test("cross-site mutations are rejected",()=>{
  assert.throws(()=>assertSameOrigin(new Request("https://qr.example.com/api/codes",{headers:{origin:"https://evil.example.com"}})));
  assert.doesNotThrow(()=>assertSameOrigin(new Request("https://qr.example.com/api/codes",{headers:{origin:"https://qr.example.com"}})));
});
test("event and book comparisons combine placements without mixing campaigns",()=>{
  const codes=[code,{...code,id:"b",name:"Summit slide",placement:"Slide"},{...code,id:"c",name:"Meetup books",event:"Meetup",book:"Patterns"}];
  const report=aggregateAnalytics(codes,[scan("one","2027-01-03T01:00:00Z"),scan("two","2027-01-03T02:00:00Z","US","b"),scan("three","2027-01-03T03:00:00Z","DE","c")],7,new Date("2027-01-03T12:00:00Z"));
  assert.deepEqual(report.byEvent,[{name:"Summit",scans:2},{name:"Meetup",scans:1}]);
  assert.deepEqual(report.byBook,[{name:"Principles",scans:2},{name:"Patterns",scans:1}]);
});

test("archived codes retain scan totals and comparisons without counting as active",()=>{
  const archived={...code,status:"paused" as const,archivedAt:"2027-01-03T10:00:00Z"};
  const result=aggregateAnalytics([archived],[scan("before-archive","2027-01-03T02:00:00Z")],7,new Date("2027-01-03T12:00:00Z"));
  assert.equal(result.activeCodes,0);assert.equal(result.totalScans,1);
  assert.deepEqual(result.byCode,[{id:code.id,name:code.name,scans:1}]);
  assert.equal(result.recent[0].codeName,code.name);
});

test("same-origin browser writes accept the request Host without trusting forwarded hosts",()=>{
  assert.doesNotThrow(()=>assertSameOrigin(new Request("http://localhost:3147/api/codes",{headers:{host:"127.0.0.1:3147",origin:"http://127.0.0.1:3147"}})));
  assert.throws(()=>assertSameOrigin(new Request("http://localhost:3147/api/codes",{headers:{host:"127.0.0.1:3147",origin:"https://evil.example.com","x-forwarded-host":"evil.example.com"}})));
});
