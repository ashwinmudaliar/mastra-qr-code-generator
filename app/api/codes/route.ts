import { getContext } from "@/lib/server/context";
import { createCode, listCodes } from "@/lib/server/repository";
import { apiError, assertSameOrigin, codeInputSchema, json, parseInput, readJson } from "@/lib/server/validation";
export const dynamic="force-dynamic";
export async function GET(request:Request) { try { const ctx=await getContext(request);return json({codes:await listCodes(ctx),mode:ctx.mode,user:ctx.user}); }catch(e){return apiError(e);} }
export async function POST(request:Request) { try { assertSameOrigin(request);const ctx=await getContext(request);const input=parseInput(codeInputSchema,await readJson(request));return json({code:await createCode(ctx,input)},201); }catch(e){return apiError(e);} }
