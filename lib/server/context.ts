import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient, isSupabaseConfigured } from "../supabase/server";
import { ApiError } from "./validation";
import { isPrivatePreview } from "./private-preview";
import { assertGoogleUser, googleLoginConfig, isGoogleLogin } from "./google-auth";
export type RequestContext = {
  mode: "local" | "supabase" | "private";
  user: {id:string; email:string};
  db: SupabaseClient | null;
};
export function isLocalPreview(request: Request) {
  const hostname = new URL(request.url).hostname;
  return process.env.NODE_ENV === "development" && process.env.QR_LOCAL_PREVIEW === "1" && ["localhost","127.0.0.1","[::1]"].includes(hostname);
}
export async function getContext(request: Request): Promise<RequestContext> {
  const google = isGoogleLogin() ? googleLoginConfig() : null;
  if (!google && isPrivatePreview(request)) return {mode:"private",user:{id:"private-workspace",email:"Private preview"},db:null};
  if (!google && isLocalPreview(request)) return {mode:"local",user:{id:"local-reviewer",email:"Local preview"},db:null};
  if (!isSupabaseConfigured()) throw new ApiError(503,"Connect Supabase to save codes and view analytics.");
  const db = await createSupabaseServerClient();
  const { data: {user}, error } = await db.auth.getUser();
  if (error || !user) throw new ApiError(401,"Sign in to your QR Studio workspace.");
  if (google) assertGoogleUser(user, google);
  const allowlist = (process.env.QR_ADMIN_EMAILS ?? "").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
  if (allowlist.length && !allowlist.includes((user.email??"").toLowerCase())) throw new ApiError(403,"This account does not have access to QR Studio.");
  return {mode:"supabase",user:{id:user.id,email:user.email??""},db};
}
