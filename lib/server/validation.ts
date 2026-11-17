import { z } from "zod";
import { DEFAULT_DESIGN } from "../qr-design";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const label = z.string().trim().max(160);
export function normalizeDestination(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Enter a complete web address, such as https://www.mastrabooks.dev."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Use an HTTP or HTTPS address without a username or password.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.startsWith("[")) {
    throw new Error("Use a publicly accessible website address.");
  }
  return url.toString();
}
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit hex color.");
const designSchema = z.object({
  foreground: color, background: color,
  gradient: z.enum(["none", "linear", "radial"]), gradientColor: color,
  gradientRotation: z.number().min(0).max(360), eyeColor: color,
  dots: z.enum(["square", "rounded", "dots", "classy"]),
  corners: z.enum(["square", "dot", "rounded"]), eyes: z.enum(["square", "dot", "rounded"]),
  logo: z.enum(["none", "mastra", "upload"]),
  logoData: z.string().max(400_000).refine(v=>!v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), "Logos must be PNG, JPEG, or WebP images."),
  logoSize: z.number().min(0.12).max(0.22),
  frame: z.enum(["none", "bottom", "banner"]), frameColor: color, caption: z.string().max(80),
}).strict();
export const codeInputSchema = z.object({
  name: z.string().trim().min(1, "Give your code a name.").max(120),
  destination: z.string().trim().min(1).max(4096).transform((v, ctx) => {
    try { return normalizeDestination(v); } catch (err) { ctx.addIssue({code:z.ZodIssueCode.custom,message:(err as Error).message}); return z.NEVER; }
  }),
  event: label.default(""),
  book: label.default(""),
  placement: label.default(""),
  status: z.enum(["active", "paused"]).default("active"),
  expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
  design: designSchema.default(DEFAULT_DESIGN),
  utm: z.object({
    enabled: z.boolean().default(true),
    source: z.string().trim().max(160).default("event"),
    medium: z.string().trim().max(160).default("qr"),
    campaign: z.string().trim().max(160).default(""),
    content: z.string().trim().max(160).default(""),
  }).default({enabled:true,source:"event",medium:"qr",campaign:"",content:""}),
}).strict();
export const codePatchSchema = codeInputSchema.partial().refine(v => Object.keys(v).length > 0, "No changes were supplied.");
export function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Check the supplied values.");
  return parsed.data;
}
export async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 1_600_000) throw new ApiError(413, "The upload is too large.");
  const raw = await request.text();
  if (raw.length > 1_600_000) throw new ApiError(413, "The upload is too large.");
  try { return JSON.parse(raw); } catch { throw new ApiError(400, "The request could not be read."); }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  // Next's local request URL may use localhost while the browser uses 127.0.0.1.
  // Host is supplied by the browser, unlike an arbitrary forwarded-host header.
  const host = request.headers.get("host");
  if (host) target.host = host;
  if (process.env.VERCEL === "1") target.protocol = "https:";
  if (origin && origin !== target.origin) throw new ApiError(403, "This request came from a different website.");
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "This request came from a different website.");
}
export function apiError(error: unknown): Response {
  if (error instanceof ApiError) return Response.json({error:error.message},{status:error.status,headers:{"Cache-Control":"no-store"}});
  console.error("QR Studio request failed", error instanceof Error ? error.message : "Unknown error");
  return Response.json({error:"Something went wrong. Please try again."},{status:500,headers:{"Cache-Control":"no-store"}});
}
export function json(data: unknown, status = 200) { return Response.json(data, {status,headers:{"Cache-Control":"no-store"}}); }
