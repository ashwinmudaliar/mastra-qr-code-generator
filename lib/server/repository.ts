import { randomBytes, randomUUID } from "node:crypto";
import type { QRCodeInput, QRCodeRecord, ScanRecord } from "../types";
import type { RequestContext } from "./context";
import { localTransaction } from "./local-store";
import { ApiError } from "./validation";
import { createScanClient } from "../supabase/server";
import { workspaceRequest } from "./private-preview";

type Row = Record<string, any>;
function fromRow(row:Row):QRCodeRecord {
  return {id:row.id,slug:row.slug,name:row.name,destination:row.destination,event:row.event,book:row.book,placement:row.placement,status:row.status,expiresAt:row.expires_at,archivedAt:row.archived_at??null,design:row.design,utm:row.utm,createdAt:row.created_at,updatedAt:row.updated_at,scans:row.scans?.[0]?.count??0};
}
function toRow(input:Partial<QRCodeInput>) {
  const row:Row={...input}; if("expiresAt" in row) {row.expires_at=row.expiresAt;delete row.expiresAt;} return row;
}
function check(error:{message:string;code?:string}|null) { if(error) throw new Error(`Database request failed (${error.code??"unknown"}): ${error.message}`); }
export async function listCodes(ctx:RequestContext):Promise<QRCodeRecord[]> {
  // Archived identities stay in this authorized list so every report keeps its history.
  if(ctx.mode==="local") return localTransaction(data=>data.codes.filter(c=>c.ownerId===ctx.user.id).map(({ownerId,...c})=>({...c,archivedAt:c.archivedAt??null,scans:data.scans.filter(s=>s.codeId===c.id).length})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
  const result:QRCodeRecord[]=[];
  for(let offset=0;;offset+=1000) {
    if(ctx.mode==="private") {
      const {codes}=await workspaceRequest<{codes:Row[]}>({operation:"list",offset});
      result.push(...codes.map(fromRow));if(codes.length<1000)break;continue;
    }
    const {data,error}=await ctx.db!.from("qr_studio_codes").select("*, scans:qr_studio_scans(count)").eq("owner_id",ctx.user.id).order("created_at",{ascending:false}).order("id").range(offset,offset+999);
    check(error);result.push(...(data??[]).map(fromRow));
    if(!data||data.length<1000)break;
  }
  return result;
}
export async function createCode(ctx:RequestContext,input:QRCodeInput):Promise<QRCodeRecord> {
  const now=new Date().toISOString(); const code:QRCodeRecord={...input,id:randomUUID(),slug:randomBytes(9).toString("base64url"),archivedAt:null,createdAt:now,updatedAt:now,scans:0};
  if(ctx.mode==="local") return localTransaction(data=>{data.codes.push({...code,ownerId:ctx.user.id});return code;},true);
  if(ctx.mode==="private") {const {code:row}=await workspaceRequest<{code:Row}>({operation:"create",input});return fromRow(row);}
  const {data,error}=await ctx.db!.from("qr_studio_codes").insert({...toRow(input),id:code.id,slug:code.slug,owner_id:ctx.user.id}).select().single();
  check(error);return fromRow(data);
}
export async function updateCode(ctx:RequestContext,id:string,input:Partial<QRCodeInput>):Promise<QRCodeRecord> {
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new ApiError(404,"This code was not found.");
  if(ctx.mode==="private") {const {code}=await workspaceRequest<{code:Row}>({operation:"update",id,input});return fromRow(code);}
  if(ctx.mode==="local") return localTransaction(data=>{const code=data.codes.find(c=>c.id===id&&c.ownerId===ctx.user.id);if(!code)throw new ApiError(404,"This code was not found.");if(code.archivedAt)throw new ApiError(409,"Restore this archived code before editing it.");Object.assign(code,input,{updatedAt:new Date().toISOString()});const{ownerId,...publicCode}=code;return{...publicCode,archivedAt:code.archivedAt??null,scans:data.scans.filter(s=>s.codeId===id).length};},true);
  const {data,error}=await ctx.db!.from("qr_studio_codes").update({...toRow(input),updated_at:new Date().toISOString()}).eq("id",id).eq("owner_id",ctx.user.id).is("archived_at",null).select("*, scans:qr_studio_scans(count)").maybeSingle();
  check(error);
  if(!data) {
    const existing=await ownedCode(ctx,id);
    if(existing.archivedAt)throw new ApiError(409,"Restore this archived code before editing it.");
    throw new ApiError(409,"This code changed. Refresh and try again.");
  }
  return fromRow(data);
}
async function ownedCode(ctx:RequestContext,id:string):Promise<QRCodeRecord> {
  const {data,error}=await ctx.db!.from("qr_studio_codes").select("*, scans:qr_studio_scans(count)").eq("id",id).eq("owner_id",ctx.user.id).maybeSingle();
  check(error);if(!data)throw new ApiError(404,"This code was not found.");return fromRow(data);
}
async function setArchived(ctx:RequestContext,id:string,archive:boolean):Promise<QRCodeRecord> {
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new ApiError(404,"This code was not found.");
  if(ctx.mode==="private") {const{code}=await workspaceRequest<{code:Row}>({operation:archive?"delete":"restore",id});return fromRow(code);}
  if(ctx.mode==="local") return localTransaction(data=>{
    const code=data.codes.find(c=>c.id===id&&c.ownerId===ctx.user.id);
    if(!code)throw new ApiError(404,"This code was not found.");
    if(Boolean(code.archivedAt)!==archive) {
      const now=new Date().toISOString();
      Object.assign(code,{archivedAt:archive?now:null,status:"paused",updatedAt:now});
    }
    const{ownerId,...publicCode}=code;
    return{...publicCode,archivedAt:code.archivedAt??null,scans:data.scans.filter(s=>s.codeId===id).length};
  },true);
  const now=new Date().toISOString();
  let query=ctx.db!.from("qr_studio_codes").update({archived_at:archive?now:null,status:"paused",updated_at:now}).eq("id",id).eq("owner_id",ctx.user.id);
  query=archive?query.is("archived_at",null):query.not("archived_at","is",null);
  const {data,error}=await query.select("*, scans:qr_studio_scans(count)").maybeSingle();
  check(error);return data?fromRow(data):ownedCode(ctx,id);
}
export const archiveCode=(ctx:RequestContext,id:string)=>setArchived(ctx,id,true);
export const restoreCode=(ctx:RequestContext,id:string)=>setArchived(ctx,id,false);
export async function getScans(ctx:RequestContext,codes:QRCodeRecord[],days:number):Promise<ScanRecord[]> {
  const ids=codes.map(c=>c.id);if(!ids.length)return[];
  const since=new Date();since.setUTCHours(0,0,0,0);since.setUTCDate(since.getUTCDate()-days+1);
  if(ctx.mode==="local")return localTransaction(data=>data.scans.filter(s=>ids.includes(s.codeId)&&s.scannedAt>=since.toISOString()));
  const result:ScanRecord[]=[];const until=new Date().toISOString();
  for(let offset=0;;offset+=1000) {
    if(ctx.mode==="private") {
      const {scans}=await workspaceRequest<{scans:Row[]}>({operation:"scans",since:since.toISOString(),until,...(ids.length===1?{codeId:ids[0]}:{}),offset});
      result.push(...scans.filter(scan=>ids.includes(scan.code_id)).map(s=>({id:s.id,codeId:s.code_id,scannedAt:s.scanned_at,country:s.country,region:s.region,city:s.city,device:s.device})));
      if(scans.length<1000)break;continue;
    }
    let query=ctx.db!.from("qr_studio_scans").select("id,code_id,scanned_at,country,region,city,device,qr_studio_codes!inner(owner_id)").eq("qr_studio_codes.owner_id",ctx.user.id).gte("scanned_at",since.toISOString()).lte("scanned_at",until).order("scanned_at").order("id").range(offset,offset+999);
    if(ids.length===1)query=query.eq("code_id",ids[0]);
    const {data,error}=await query;
    check(error);result.push(...(data??[]).map(s=>({id:s.id,codeId:s.code_id,scannedAt:s.scanned_at,country:s.country,region:s.region,city:s.city,device:s.device})));
    if(!data||data.length<1000)break;
  }
  return result;
}
export async function findScanCode(slug:string,local:boolean):Promise<QRCodeRecord|null> {
  if(!/^[A-Za-z0-9_-]{12}$/.test(slug))return null;
  if(local)return localTransaction(data=>{const found=data.codes.find(c=>c.slug===slug);if(!found)return null;const{ownerId,...code}=found;return code;});
  const {data,error}=await createScanClient().from("qr_studio_codes").select("*").eq("slug",slug).maybeSingle();check(error);return data?fromRow(data):null;
}
export async function recordScan(codeId:string,metadata:Omit<ScanRecord,"id"|"codeId"|"scannedAt">,local:boolean) {
  const scan:ScanRecord={id:randomUUID(),codeId,scannedAt:new Date().toISOString(),...metadata};
  if(local)return localTransaction(data=>{data.scans.push(scan);return scan;},true);
  const{error}=await createScanClient().from("qr_studio_scans").insert({id:scan.id,code_id:codeId,scanned_at:scan.scannedAt,...metadata});check(error);
  return scan;
}
