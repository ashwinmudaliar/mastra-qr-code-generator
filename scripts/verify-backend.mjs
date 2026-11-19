import assert from 'node:assert/strict';
import { archiveVerificationCode } from './archive-verification-code.mjs';
const base = process.env.QR_TEST_URL || 'http://127.0.0.1:3000';
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'Only run this check on a local preview.');
const request=(path,options={})=>fetch(new URL(path,base),options);
const session=await(await request('/api/session')).json();
assert.equal(session.mode,'local','Start the development server with QR_LOCAL_PREVIEW=1.');
let code;
try {
  const input={name:'Temporary backend verification',destination:'https://www.mastrabooks.dev/?existing=1#books',event:'Verification',book:'Principles',placement:'Test',status:'active',expiresAt:null,utm:{enabled:true,source:'event',medium:'qr',campaign:'test campaign',content:'book'}};
  const create=await request('/api/codes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  assert.equal(create.status,201,await create.clone().text());code=(await create.json()).code;assert.ok(code.slug);
  const redirect=await request(`/q/${code.slug}`,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (iPhone) Mobile'}});
  assert.equal(redirect.status,302);assert.match(redirect.headers.get('Cache-Control'),/no-store/);
  const destination=new URL(redirect.headers.get('Location'));assert.equal(destination.searchParams.get('existing'),'1');assert.equal(destination.searchParams.get('utm_campaign'),'test campaign');assert.equal(destination.hash,'#books');
  const report=await(await request(`/api/analytics?codeId=${code.id}&days=30`)).json();assert.equal(report.totalScans,1);assert.equal(report.byDevice[0].name,'Mobile');assert.equal(report.byCountry[0].name,'Unknown');
  const head=await request(`/q/${code.slug}`,{method:'HEAD',redirect:'manual'});assert.equal(head.status,302);
  await request(`/api/codes/${code.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'paused'})});
  const paused=await request(`/q/${code.slug}`,{redirect:'manual'});assert.equal(paused.status,410);
  const after=await(await request(`/api/analytics?codeId=${code.id}&days=30`)).json();assert.equal(after.totalScans,1);
  await request(`/api/codes/${code.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'active',destination:'https://www.mastrabooks.dev/updated'})});
  const updated=await request(`/q/${code.slug}`,{method:'HEAD',redirect:'manual'});assert.equal(new URL(updated.headers.get('Location')).pathname,'/updated');
  const invalid=await request('/api/codes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,destination:'javascript:alert(1)'})});assert.equal(invalid.status,400);
  const foreign=await request('/api/codes',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://elsewhere.invalid'},body:JSON.stringify(input)});assert.equal(foreign.status,403);
  const archived=await request(`/api/codes/${code.id}`,{method:'DELETE'});assert.equal(archived.status,200);
  const retained=(await(await request('/api/codes')).json()).codes.find(item=>item.id===code.id);
  assert.ok(retained.archivedAt);assert.equal(retained.slug,code.slug);assert.equal(retained.scans,1);assert.equal(retained.status,'paused');
  assert.equal((await request(`/q/${code.slug}`,{redirect:'manual'})).status,410,'Archived codes cannot collect new scans');
  const staleEdit=await request(`/api/codes/${code.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'active',destination:'https://example.com/stale-editor'})});
  assert.equal(staleEdit.status,409,'A stale editor cannot reactivate an archived code');
  assert.equal((await(await request(`/api/analytics?codeId=${code.id}&days=30`)).json()).totalScans,1,'Archival retains historical scans');
  const restored=await request(`/api/codes/${code.id}/restore`,{method:'POST'});assert.equal(restored.status,200);
  const restoredCode=(await restored.json()).code;assert.equal(restoredCode.id,code.id);assert.equal(restoredCode.slug,code.slug);assert.equal(restoredCode.archivedAt,null);assert.equal(restoredCode.status,'paused');
  assert.equal((await request(`/q/${code.slug}`,{redirect:'manual'})).status,410,'Restore must not activate a printed code');
  console.log('Backend HTTP checks passed: durable create/read, redirect, UTM, scan analytics, HEAD, pause/resume, editable destination, URL validation, cross-origin protection, archive history, stale-edit rejection, and restore paused.');
} finally {
  if(code)await archiveVerificationCode({base,code,request,output:new URL('../outputs/backend/',import.meta.url).pathname});
}
