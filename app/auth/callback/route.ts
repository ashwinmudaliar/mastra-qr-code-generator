import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { completeGoogleLogin, googleLoginConfig, isGoogleLogin } from "@/lib/server/google-auth";
import { ApiError, apiError } from "@/lib/server/validation";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  if (isGoogleLogin()) {
    try {
      const config = googleLoginConfig();
      if (!isSupabaseConfigured()) throw new ApiError(503, "Google sign-in is not configured yet.");
      const db = await createSupabaseServerClient();
      return await completeGoogleLogin(request, db.auth, config);
    } catch (error) { return apiError(error); }
  }
  const url=new URL(request.url);const code=url.searchParams.get("code");
  if(code&&isSupabaseConfigured()) {const db=await createSupabaseServerClient();const{error}=await db.auth.exchangeCodeForSession(code);if(!error)return Response.redirect(new URL("/",url),303);}
  return Response.redirect(new URL("/?auth=confirm",url),303);
}
