import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { assertGoogleRequestOrigin, googleLoginConfig, isGoogleLogin } from "@/lib/server/google-auth";
import { ApiError, apiError, json } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    if (!isGoogleLogin()) throw new ApiError(404, "Google sign-in is not enabled.");
    const config = googleLoginConfig();
    assertGoogleRequestOrigin(request, config);
    if (!isSupabaseConfigured()) throw new ApiError(503, "Google sign-in is not configured yet.");
    const db = await createSupabaseServerClient();
    const { data, error } = await db.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL("/auth/callback", config.origin).toString(),
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url) throw new ApiError(503, "Could not start Google sign-in. Please try again.");
    return json({ url: data.url });
  } catch (error) { return apiError(error); }
}
