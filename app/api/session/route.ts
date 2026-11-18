import { getContext, isLocalPreview } from "@/lib/server/context";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { ApiError, apiError, json } from "@/lib/server/validation";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const mode=isLocalPreview(request)?"local":"supabase";
  const configured=mode==="local"||isSupabaseConfigured();
  try{const ctx=await getContext(request);return json({configured,mode:ctx.mode,user:ctx.user});}
  catch(e){if(process.env.QR_PRIVATE_PREVIEW==="1")return apiError(e);if(e instanceof ApiError&&[401,403,503].includes(e.status))return json({configured,mode,user:null,error:e.status===403?e.message:undefined});return apiError(e);}
}
