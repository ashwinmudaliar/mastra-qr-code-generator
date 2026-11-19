import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ApiError, apiError, assertSameOrigin, json } from "@/lib/server/validation";
import { assertGoogleRequestOrigin, googleLoginConfig, isGoogleLogin } from "@/lib/server/google-auth";
export async function POST(request:Request) { try {
  if(isGoogleLogin())assertGoogleRequestOrigin(request,googleLoginConfig());else assertSameOrigin(request);
  if(isSupabaseConfigured()){const db=await createSupabaseServerClient();const {error}=await db.auth.signOut({scope:"local"});if(error)throw new ApiError(503,"Could not sign out. Please try again.");}
  return json({ok:true});
}catch(e){return apiError(e);} }
