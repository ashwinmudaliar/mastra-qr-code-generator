import { z } from "zod";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ApiError, apiError, assertSameOrigin, json, parseInput, readJson } from "@/lib/server/validation";
import { isGoogleLogin } from "@/lib/server/google-auth";
const inputSchema=z.object({email:z.string().email().max(254),password:z.string().min(1).max(256)});
export async function POST(request:Request) { try {
  if(isGoogleLogin())throw new ApiError(403,"Use Google to sign in to QR Studio.");
  assertSameOrigin(request);if(!isSupabaseConfigured())throw new ApiError(503,"Connect Supabase to sign in.");
  const input=parseInput(inputSchema,await readJson(request));const db=await createSupabaseServerClient();
  const{data,error}=await db.auth.signInWithPassword(input);
  if(error||!data.user)throw new ApiError(401,"Could not sign in. Check your email and password, and confirm your email if this is a new account.");
  return json({user:{id:data.user.id,email:data.user.email}});
}catch(e){return apiError(e);} }
