import { getContext, isLocalPreview } from "@/lib/server/context";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { ApiError, apiError, json } from "@/lib/server/validation";
import { booksPreviewOrigin } from "@/lib/server/attribution";
import { publicScanOrigin } from "@/lib/server/public-scanning";
import { isGoogleLogin } from "@/lib/server/google-auth";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const authProvider=isGoogleLogin()?"google":undefined;
  const mode=!authProvider&&isLocalPreview(request)?"local":"supabase";
  const configured=mode==="local"||isSupabaseConfigured();
  try{const ctx=await getContext(request);return json({configured,authProvider,mode:ctx.mode,user:ctx.user,booksPreviewOrigin:booksPreviewOrigin(ctx.mode),publicScanOrigin:publicScanOrigin()});}
  catch(e){if(process.env.QR_PRIVATE_PREVIEW==="1")return apiError(e);if(e instanceof ApiError&&[401,403,503].includes(e.status))return json({configured:configured&&e.status!==503,authProvider,mode,user:null,error:e.status!==401?e.message:undefined});return apiError(e);}
}
