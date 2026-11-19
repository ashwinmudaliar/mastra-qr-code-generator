import { z } from "zod";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ApiError, apiError, assertSameOrigin, json, parseInput, readJson } from "@/lib/server/validation";
import { isGoogleLogin } from "@/lib/server/google-auth";
const inputSchema=z.object({email:z.string().email().max(254),password:z.string().min(12,"Use a password with at least 12 characters.").max(256)});
export async function POST(request:Request) { try {
  if(isGoogleLogin())throw new ApiError(403,"Use Google to sign in to QR Studio.");
  assertSameOrigin(request);if(!isSupabaseConfigured())throw new ApiError(503,"Connect Supabase to create your account.");
  const input=parseInput(inputSchema,await readJson(request));
  const allowlist=(process.env.QR_ADMIN_EMAILS??"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
  if(allowlist.length&&!allowlist.includes(input.email.toLowerCase()))throw new ApiError(403,"This email address does not have access to QR Studio.");
  const db=await createSupabaseServerClient();
  const{data,error}=await db.auth.signUp({...input,options:{emailRedirectTo:new URL("/auth/callback",request.url).toString()}});
  if(error)throw new ApiError(400,"Could not create the account. Try signing in if you already have an account, or try again later.");
  return json({user:data.session&&data.user?{id:data.user.id,email:data.user.email}:null,confirmationRequired:!data.session,message:data.session?"Your account is ready.":"Check your email to confirm your account, then return here to sign in."});
}catch(e){return apiError(e);} }
