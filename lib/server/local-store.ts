import { promises as fs } from "node:fs";
import path from "node:path";
import type { QRCodeRecord, ScanRecord } from "../types";

type LocalData = {codes:(QRCodeRecord & {ownerId:string})[]; scans:ScanRecord[]};
const filename = path.join(process.cwd(),".data","qr-studio.json");
let queue:Promise<unknown>=Promise.resolve();
async function read():Promise<LocalData> {
  try { return JSON.parse(await fs.readFile(filename,"utf8")); }
  catch(error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {codes:[],scans:[]}; throw error; }
}
export function localTransaction<T>(fn:(data:LocalData)=>T|Promise<T>, write=false):Promise<T> {
  const next=queue.then(async()=>{
    if(process.env.NODE_ENV!=="development" || process.env.QR_LOCAL_PREVIEW!=="1") throw new Error("Local storage is disabled.");
    const data=await read(); const result=await fn(data);
    if(write) { await fs.mkdir(path.dirname(filename),{recursive:true}); const temp=filename+".tmp"; await fs.writeFile(temp,JSON.stringify(data),{mode:0o600}); await fs.rename(temp,filename); }
    return result;
  });
  queue=next.catch(()=>undefined); return next;
}
