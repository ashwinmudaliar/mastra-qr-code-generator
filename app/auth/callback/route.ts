import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const url=new URL(request.url);const code=url.searchParams.get("code");
  if(code&&isSupabaseConfigured()) {const db=await createSupabaseServerClient();const{error}=await db.auth.exchangeCodeForSession(code);if(!error)return Response.redirect(new URL("/",url),303);}
  return Response.redirect(new URL("/?auth=confirm",url),303);
}
