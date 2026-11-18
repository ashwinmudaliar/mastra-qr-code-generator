import { createHmac } from "node:crypto";
import { z } from "zod";

type Environment = Record<string, string | undefined>;
const label = z.string().max(160).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
export const attributionSchema = z.object({
  v: z.literal(1),
  codeId: z.string().uuid(),
  visitId: z.string().uuid(),
  visitedAt: z.string().datetime(),
  event: label,
  book: label,
  placement: label,
}).strict();
export type QRAttribution = z.infer<typeof attributionSchema>;

/** Only the ordinary Books intake participates. Separate partner, card, and
 * Agents in Prod routes retain their existing contracts. */
export function isBooksIntake(url: URL, previewOrigin?: string): boolean {
  if (url.username || url.password || url.pathname !== "/") return false;
  return (url.protocol === "https:" && !url.port && ["mastrabooks.dev", "www.mastrabooks.dev"].includes(url.hostname)) ||
    (!!previewOrigin && url.origin === previewOrigin);
}

export function booksPreviewOrigin(mode: "local" | "private" | "supabase", env: Environment = process.env): string | undefined {
  if (mode === "supabase" || !env.QR_BOOKS_PREVIEW_ORIGIN) return undefined;
  try {
    const url = new URL(env.QR_BOOKS_PREVIEW_ORIGIN);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return undefined;
    if (mode === "local" && env.NODE_ENV === "development" && env.QR_LOCAL_PREVIEW === "1" &&
      url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return url.origin;
    if (url.protocol !== "https:" || url.port || !/^[a-z0-9-]+\.vercel\.app$/.test(url.hostname)) return undefined;
    return url.origin;
  } catch { return undefined; }
}

export function signAttribution(input: unknown, secret: string | undefined, now = Date.now()): string | null {
  if (!secret || secret.length < 32 || secret.length > 512) return null;
  const parsed = attributionSchema.safeParse(input);
  if (!parsed.success) return null;
  const age = now - Date.parse(parsed.data.visitedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 24 * 60 * 60 * 1000) return null;
  const encoded = Buffer.from(JSON.stringify(parsed.data)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

/** This is optional tracking. Missing metadata/keys never prevent a redirect.
 * The caller establishes the private/local runtime before selecting a mode. */
export function booksDestination(destination: string, attribution: unknown, mode: "local" | "private" | "supabase", env: Environment = process.env): string {
  if (mode === "supabase") return destination;
  try {
    const url = new URL(destination);
    const preview = booksPreviewOrigin(mode, env);
    if (!isBooksIntake(url, preview)) return destination;
    // Never carry a previously pasted visitor's attribution through a new scan.
    url.searchParams.delete("qr_ref");
    if (preview) {
      const replacement = new URL(preview);
      url.protocol = replacement.protocol;
      url.host = replacement.host;
    }
    const token = signAttribution(attribution, env.QR_ATTRIBUTION_SECRET);
    if (token) url.searchParams.set("qr_ref", token);
    return url.toString();
  } catch { return destination; }
}
