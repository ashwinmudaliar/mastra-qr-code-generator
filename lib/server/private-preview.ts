import { ApiError } from "./validation";

/** Deployment Protection is the access boundary. These checks prevent enabling
 * the account-free workspace outside its protected Vercel preview deployment. */
export function isPrivatePreview(request: Request, env: Record<string, string | undefined> = process.env): boolean {
  if (env.QR_PRIVATE_PREVIEW !== "1") return false;
  const host = new URL(request.url).hostname;
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" || !env.VERCEL_URL ||
      host !== env.VERCEL_URL || !host.endsWith(".vercel.app")) {
    throw new ApiError(503, "The private workspace is only available on its protected preview address.");
  }
  if (!env.QR_WORKSPACE_GATEWAY_KEY || env.QR_WORKSPACE_GATEWAY_KEY.length < 32 || !env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new ApiError(503, "The private workspace is not configured yet.");
  }
  return true;
}

export async function workspaceRequest<T>(payload: Record<string, unknown>): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.QR_WORKSPACE_GATEWAY_KEY;
  if (!url || !key) throw new ApiError(503, "The private workspace is not configured yet.");
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/workspace-gateway`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
  } catch { throw new ApiError(503, "The private workspace is temporarily unavailable. Please try again."); }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 404) throw new ApiError(404, "This code was not found.");
    if (response.status === 409) throw new ApiError(409, "Restore this archived code before editing it.");
    if (response.status === 400 || response.status === 413) throw new ApiError(response.status, "Check the supplied QR code settings.");
    throw new ApiError(503, "The private workspace is temporarily unavailable. Please try again.");
  }
  if (!result || typeof result !== "object") throw new ApiError(503, "The private workspace returned an invalid response.");
  return result as T;
}
