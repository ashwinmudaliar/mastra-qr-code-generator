import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ApiError } from "./validation";

type AuthEnvironment = Record<string, string | undefined>;
export type GoogleLoginConfig = { origin: string; emails: string[] };

export function isGoogleLogin(env: AuthEnvironment = process.env) {
  return env.QR_GOOGLE_LOGIN === "1";
}

export function googleLoginConfig(env: AuthEnvironment = process.env): GoogleLoginConfig {
  const emails = (env.QR_ADMIN_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  let origin: URL;
  try { origin = new URL(env.QR_STUDIO_ORIGIN ?? ""); }
  catch { throw new ApiError(503, "Google sign-in is not configured yet."); }
  if (!emails.length || emails.some(email => !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) ||
    origin.protocol !== "https:" || origin.username || origin.password || origin.port ||
    origin.pathname !== "/" || origin.search || origin.hash || !origin.hostname.includes(".") ||
    env.QR_PRIVATE_PREVIEW === "1" || env.QR_LOCAL_PREVIEW === "1") {
    throw new ApiError(503, "Google sign-in is not configured yet.");
  }
  return { origin: origin.origin, emails };
}

export function assertGoogleRequestOrigin(request: Request, config: GoogleLoginConfig, requireOrigin = true) {
  // Use the fixed deployment address, never forwarded-host or user-supplied return URLs.
  if (new URL(request.url).origin !== config.origin ||
    (requireOrigin && request.headers.get("origin") !== config.origin) ||
    (requireOrigin && request.headers.get("sec-fetch-site") === "cross-site")) {
    throw new ApiError(403, "Open QR Studio at its sign-in address to continue.");
  }
}

export function assertGoogleUser(user: User, config: GoogleLoginConfig) {
  if (!user.email_confirmed_at || !config.emails.includes((user.email ?? "").toLowerCase()) ||
    !user.identities?.some(identity => identity.provider === "google")) {
    throw new ApiError(403, "This Google account does not have access to QR Studio.");
  }
}

export function authRedirect(config: GoogleLoginConfig, result?: "failed" | "denied") {
  const url = new URL("/", config.origin);
  if (result) url.searchParams.set("auth", result);
  return new Response(null, { status: 303, headers: {
    Location: url.toString(), "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer",
  } });
}

export async function completeGoogleLogin(request: Request, auth: Pick<SupabaseClient["auth"], "exchangeCodeForSession" | "getUser" | "signOut">, config: GoogleLoginConfig) {
  assertGoogleRequestOrigin(request, config, false);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048 || url.searchParams.has("error")) return authRedirect(config, "failed");
  const { error } = await auth.exchangeCodeForSession(code);
  if (error) return authRedirect(config, "failed");
  // The exchange's session object is not the authorization boundary. Fetch the current user.
  const { data: { user }, error: userError } = await auth.getUser();
  try {
    if (userError || !user) throw new ApiError(403, "Sign-in could not be verified.");
    assertGoogleUser(user, config);
  } catch {
    await auth.signOut({ scope: "local" });
    return authRedirect(config, "denied");
  }
  return authRedirect(config);
}
