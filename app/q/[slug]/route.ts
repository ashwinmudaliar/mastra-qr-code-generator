import { isLocalPreview } from "@/lib/server/context";
import { findScanCode, recordScan } from "@/lib/server/repository";
import { destinationWithUTM, isAvailable, scanMetadata, shouldCountVisit } from "@/lib/server/analytics";
import { normalizeDestination } from "@/lib/server/validation";
import { isPrivatePreview } from "@/lib/server/private-preview";
import { booksDestination } from "@/lib/server/attribution";
export const dynamic="force-dynamic";
export const runtime="nodejs";
type Params={params:Promise<{slug:string}>};
const noCache={"Cache-Control":"private, no-store, max-age=0","X-Robots-Tag":"noindex, nofollow","Referrer-Policy":"no-referrer"};
function unavailable(status:number,message:string) {return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mastra QR Studio</title><body style="font:16px system-ui;background:#020202;color:#f0f0f0;display:grid;min-height:95vh;place-items:center;margin:0"><main style="max-width:400px;padding:32px"><p style="font-size:13px;letter-spacing:2px">MASTRA QR STUDIO</p><h1>This code isn’t available</h1><p>${message}</p><a href="https://www.mastrabooks.dev" style="color:#7aff78">Visit Mastra Books →</a></main></body></html>`,{status,headers:{...noCache,"Content-Type":"text/html; charset=utf-8"}});}
export async function GET(request:Request,{params}:Params) {
  try {
    const{slug}=await params;const local=isLocalPreview(request);
    const mode=isPrivatePreview(request)?"private":local?"local":"supabase";
    const count=shouldCountVisit(request);
    if(!/^[A-Za-z0-9_-]{12}$/.test(slug))return unavailable(404,"The link may be incomplete. Check the code or ask your event organizer.");
    if(!local && process.env.QR_SCAN_GATEWAY_KEY) {
      const projectUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
      if(!projectUrl)throw new Error("Scan service is not configured");
      const response=await fetch(`${projectUrl.replace(/\/$/,"")}/functions/v1/scan-gateway`,{
        method:"POST",cache:"no-store",signal:AbortSignal.timeout(8000),
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.QR_SCAN_GATEWAY_KEY}`},
        body:JSON.stringify({slug,count,metadata:scanMetadata(request)}),
      });
      if(response.status===404)return unavailable(404,"The link may be incomplete. Check the code or ask your event organizer.");
      if(response.status===410)return unavailable(410,"This campaign has ended or is currently paused.");
      if(!response.ok)throw new Error("Scan service is temporarily unavailable");
      const result:unknown=await response.json();
      if(!result || typeof result!=="object" || !("destination" in result) || typeof result.destination!=="string")throw new Error("Invalid scan service response");
      const attribution=count && "recorded" in result && result.recorded===true && "attribution" in result?result.attribution:null;
      return new Response(null,{status:302,headers:{...noCache,Location:booksDestination(normalizeDestination(result.destination),attribution,mode)}});
    }
    const code=await findScanCode(slug,local);
    if(!code)return unavailable(404,"The link may be incomplete. Check the code or ask your event organizer.");
    if(!isAvailable(code))return unavailable(410,"This campaign has ended or is currently paused.");
    let attribution=null;
    if(count)try{
      const scan=await recordScan(code.id,scanMetadata(request),local);
      attribution={v:1,codeId:code.id,visitId:scan.id,visitedAt:scan.scannedAt,event:code.event,book:code.book,placement:code.placement};
    }catch(e){console.error("Scan recording failed",e instanceof Error?e.message:"Unknown error");}
    return new Response(null,{status:302,headers:{...noCache,Location:booksDestination(destinationWithUTM(normalizeDestination(code.destination),code.utm),attribution,mode)}});
  }catch(e){console.error("QR redirect failed",e instanceof Error?e.message:"Unknown error");return unavailable(503,"Please try again in a moment.");}
}
export async function HEAD(request:Request,context:Params) {const response=await GET(new Request(request.url,{method:"HEAD",headers:request.headers}),context);return new Response(null,{status:response.status,headers:response.headers});}
