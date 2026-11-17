import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { apiError, assertSameOrigin, json } from "@/lib/server/validation";
export async function POST(request:Request) { try {assertSameOrigin(request);if(isSupabaseConfigured()){const db=await createSupabaseServerClient();await db.auth.signOut();}return json({ok:true});}catch(e){return apiError(e);} }
