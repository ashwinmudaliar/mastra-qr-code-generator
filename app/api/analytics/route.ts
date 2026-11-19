import { getContext } from "@/lib/server/context";
import { getScans, listCodes } from "@/lib/server/repository";
import { aggregateAnalytics } from "@/lib/server/analytics";
import { ApiError, apiError, json } from "@/lib/server/validation";
export const dynamic="force-dynamic";
export async function GET(request:Request) { try {
  const ctx=await getContext(request);const url=new URL(request.url);
  const days=Number(url.searchParams.get("days")??30);
  if(!Number.isInteger(days)||days<1||days>366)throw new ApiError(400,"Choose a period between 1 and 366 days.");
  let codes=await listCodes(ctx);const codeId=url.searchParams.get("codeId");
  const event=url.searchParams.get("event");
  if(event)codes=codes.filter(c=>c.event===event);
  if(codeId){codes=codes.filter(c=>c.id===codeId);if(!codes.length)throw new ApiError(404,"This code was not found.");}
  const scans=await getScans(ctx,codes,days);return json(aggregateAnalytics(codes,scans,days));
}catch(e){return apiError(e);} }
