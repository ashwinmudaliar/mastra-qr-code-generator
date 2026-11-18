import { z } from "zod";
import type { FulfillmentMetrics, FulfillmentReport, FulfillmentResponse, QRCodeRecord } from "../types";
import type { RequestContext } from "./context";
import { booksPreviewOrigin } from "./attribution";
import { ApiError } from "./validation";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const metricsShape = { requests: count, booksRequested: count, booksShipped: count, deliveredOrders: count, needsAttention: count };
const text = z.string().max(160);
const metricsSchema = z.object(metricsShape).strict();
const reportSchema = z.object({
  version: z.literal(1),
  preview: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }),
  totals: metricsSchema,
  byCode: z.array(z.object({ ...metricsShape, codeId: z.string().uuid(), event: text, book: text, placement: text }).strict()).max(10_000),
  byCountry: z.array(z.object({ ...metricsShape, name: z.string().max(100) }).strict()).max(10_000),
  byCity: z.array(z.object({ ...metricsShape, name: z.string().max(320) }).strict()).max(10_000),
  coverage: z.object({ trackedRequests: count, untrackedDeliveryRequests: count }).strict(),
}).strict();
const metricKeys = Object.keys(metricsShape) as (keyof FulfillmentMetrics)[];
const zeroMetrics = (): FulfillmentMetrics => ({ requests: 0, booksRequested: 0, booksShipped: 0, deliveredOrders: 0, needsAttention: 0 });
type Environment = Record<string, string | undefined>;
type Fetcher = typeof fetch;

export function fulfillmentFilters(url: URL, codes: QRCodeRecord[], now = new Date()) {
  const days = Number(url.searchParams.get("days") ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new ApiError(400, "Choose a period between 1 and 366 days.");
  const codeId = url.searchParams.get("codeId") ?? url.searchParams.get("code");
  const event = url.searchParams.get("event");
  if (event && event.length > 160) throw new ApiError(400, "Choose an event from your workspace.");
  let scoped = codes;
  if (codeId) {
    scoped = scoped.filter(code => code.id === codeId);
    if (!scoped.length) throw new ApiError(404, "This code was not found.");
  }
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - days + 1);
  return { codeIds: scoped.map(code => code.id), from: from.toISOString(), to: now.toISOString(), ...(event ? { event } : {}) };
}

export function parseFulfillmentReport(value: unknown, allowedIds: readonly string[]): FulfillmentReport {
  const report = reportSchema.parse(value);
  const allowed = new Set(allowedIds);
  if (report.byCode.some(row => !allowed.has(row.codeId))) throw new Error("Report included an out-of-scope code");
  for (const metric of metricKeys) {
    if (report.byCode.reduce((sum, row) => sum + row[metric], 0) !== report.totals[metric]) {
      throw new Error("Report totals do not match scoped codes");
    }
  }
  if (report.coverage.trackedRequests + report.coverage.untrackedDeliveryRequests !== report.totals.requests) {
    throw new Error("Report coverage does not match requests");
  }
  return report;
}

function mergeReports(reports: FulfillmentReport[]): FulfillmentReport {
  const result: FulfillmentReport = {
    version: 1, preview: true, updatedAt: reports[0].updatedAt, totals: zeroMetrics(),
    byCode: [], byCountry: [], byCity: [], coverage: { trackedRequests: 0, untrackedDeliveryRequests: 0 },
  };
  for (const report of reports) {
    if (!report.preview) throw new Error("A private preview returned production data");
    if (Date.parse(report.updatedAt) < Date.parse(result.updatedAt)) result.updatedAt = report.updatedAt;
    for (const key of metricKeys) result.totals[key] += report.totals[key];
    result.byCode.push(...report.byCode);
    result.coverage.trackedRequests += report.coverage.trackedRequests;
    result.coverage.untrackedDeliveryRequests += report.coverage.untrackedDeliveryRequests;
  }
  for (const key of ["byCountry", "byCity"] as const) {
    const grouped = new Map<string, FulfillmentMetrics & { name: string }>();
    for (const report of reports) for (const row of report[key]) {
      const target = grouped.get(row.name) ?? { name: row.name, ...zeroMetrics() };
      for (const metric of metricKeys) target[metric] += row[metric];
      grouped.set(row.name, target);
    }
    result[key] = [...grouped.values()].sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name));
  }
  return result;
}

async function limitedResponse(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > 5_000_000 || !response.body) throw new Error("Invalid report size");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 5_000_000) { await reader.cancel(); throw new Error("Report too large"); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function fetchFulfillment(
  mode: RequestContext["mode"], filters: ReturnType<typeof fulfillmentFilters>,
  env: Environment = process.env, fetcher: Fetcher = fetch,
): Promise<FulfillmentResponse> {
  const previewOrigin = booksPreviewOrigin(mode, env);
  if (mode === "supabase" || !previewOrigin || !env.QR_BOOKS_REPORT_URL || !env.QR_BOOKS_REPORT_KEY || env.QR_BOOKS_REPORT_KEY.length < 32) {
    return { status: "not_configured", report: null, previewOrigin, message: "Books fulfillment is not connected in this preview." };
  }
  try {
    const url = new URL(env.QR_BOOKS_REPORT_URL);
    if (url.origin !== previewOrigin || url.pathname !== "/api/qr/report" || url.search || url.hash || url.username || url.password) {
      throw new Error("Report endpoint must match the private Books preview");
    }
    const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${env.QR_BOOKS_REPORT_KEY}` };
    if (env.QR_BOOKS_PROTECTION_BYPASS && url.protocol === "https:" && url.hostname.endsWith(".vercel.app")) {
      headers["x-vercel-protection-bypass"] = env.QR_BOOKS_PROTECTION_BYPASS;
    }
    const reports: FulfillmentReport[] = [];
    const batches = Math.max(1, Math.ceil(filters.codeIds.length / 500));
    for (let i = 0; i < batches; i++) {
      const codeIds = filters.codeIds.slice(i * 500, (i + 1) * 500);
      const response = await fetcher(url, {
        method: "POST", cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10_000), headers,
        body: JSON.stringify({ ...filters, codeIds }),
      });
      if (!response.ok) throw new Error("Books reporting unavailable");
      reports.push(parseFulfillmentReport(await limitedResponse(response), codeIds));
    }
    return { status: "connected", report: mergeReports(reports), previewOrigin };
  } catch {
    // Do not echo upstream errors, customer data, endpoint secrets, or pretend
    // that an outage means there were zero requests. The client keeps its cache.
    return { status: "unavailable", report: null, previewOrigin, message: "Fulfillment results could not be refreshed. Try again shortly." };
  }
}
