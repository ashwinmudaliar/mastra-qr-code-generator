import { getContext } from "@/lib/server/context";
import { deleteCode, updateCode } from "@/lib/server/repository";
import { apiError, assertSameOrigin, codePatchSchema, json, parseInput, readJson } from "@/lib/server/validation";
export const dynamic="force-dynamic";
type Params={params:Promise<{id:string}>};
export async function PATCH(request:Request,{params}:Params) { try { assertSameOrigin(request);const ctx=await getContext(request);const{id}=await params;const input=parseInput(codePatchSchema,await readJson(request));return json({code:await updateCode(ctx,id,input)}); }catch(e){return apiError(e);} }
export async function DELETE(request:Request,{params}:Params) { try { assertSameOrigin(request);const ctx=await getContext(request);const{id}=await params;await deleteCode(ctx,id);return json({ok:true}); }catch(e){return apiError(e);} }
