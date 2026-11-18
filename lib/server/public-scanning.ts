import { ApiError } from "./validation";

/** This flag describes a separately deployed scanner; it never relaxes Studio access. */
export function publicScanOrigin(env: Record<string, string | undefined> = process.env): string | undefined {
  if (!env.QR_PUBLIC_SCAN_ORIGIN) return undefined;
  try {
    const url = new URL(env.QR_PUBLIC_SCAN_ORIGIN);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.pathname !== "/" || url.search || url.hash || !url.hostname.includes(".") ||
        url.hostname.endsWith(".vercel.app") || url.hostname.endsWith(".local") ||
        url.hostname.endsWith(".localhost") || url.origin !== env.NEXT_PUBLIC_QR_SCAN_ORIGIN) throw new Error();
    return url.origin;
  } catch {
    throw new ApiError(503, "The public scan address is not configured correctly.");
  }
}
