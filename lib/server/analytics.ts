import type { Analytics, QRCodeRecord, ScanRecord, UTMSettings, DeviceType } from "../types";

export function destinationWithUTM(destination: string, utm: UTMSettings): string {
  const url = new URL(destination);
  if (utm.enabled) {
    const values = { utm_source: utm.source, utm_medium: utm.medium, utm_campaign: utm.campaign, utm_content: utm.content };
    for (const [key, value] of Object.entries(values)) if (value.trim()) url.searchParams.set(key, value.trim());
  }
  return url.toString();
}
export function isAvailable(code: Pick<QRCodeRecord, "status" | "expiresAt"> & Partial<Pick<QRCodeRecord, "archivedAt">>, now = Date.now()) {
  return !code.archivedAt && code.status === "active" && (!code.expiresAt || new Date(code.expiresAt).getTime() > now);
}
export function deviceFromUserAgent(ua: string): DeviceType {
  if (/ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return "Tablet";
  if (/iphone|ipod|android|mobile/i.test(ua)) return "Mobile";
  if (/windows|macintosh|linux|cros/i.test(ua)) return "Desktop";
  return "Other";
}
export function shouldCountVisit(request: Request) {
  if (request.method !== "GET" || request.headers.has("next-router-prefetch") || /prefetch/i.test(request.headers.get("purpose") ?? "") || /prefetch/i.test(request.headers.get("sec-purpose") ?? "")) return false;
  return !/bot|crawler|spider|slurp|facebookexternalhit|preview|headless/i.test(request.headers.get("user-agent") ?? "");
}
function safeGeo(value: string | null): string {
  if (!value) return "Unknown";
  try { value = decodeURIComponent(value); } catch { return "Unknown"; }
  return value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0,120) || "Unknown";
}
export function scanMetadata(request: Request, vercel = process.env.VERCEL === "1") {
  return {
    country: vercel ? safeGeo(request.headers.get("x-vercel-ip-country")) : "Unknown",
    region: vercel ? safeGeo(request.headers.get("x-vercel-ip-country-region")) : "Unknown",
    city: vercel ? safeGeo(request.headers.get("x-vercel-ip-city")) : "Unknown",
    device: deviceFromUserAgent(request.headers.get("user-agent") ?? ""),
  };
}
export function aggregateAnalytics(codes: QRCodeRecord[], scans: ScanRecord[], periodDays: number, now = new Date()): Analytics {
  const byDate = new Map<string, number>();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - periodDays + 1);
  for (let i=0;i<periodDays;i++) { const d = new Date(start); d.setUTCDate(d.getUTCDate()+i); byDate.set(d.toISOString().slice(0,10),0); }
  const codeMap = new Map(codes.map(c=>[c.id,c]));
  const filtered = scans.filter(s=>codeMap.has(s.codeId) && new Date(s.scannedAt)>=start && new Date(s.scannedAt)<=now);
  const countries = new Map<string,number>();
  const cities = new Map<string,number>();
  const devices = new Map<string,number>();
  const perCode = new Map<string,number>();
  const events = new Map<string,number>();
  const books = new Map<string,number>();
  for(const scan of filtered) {
    const date = scan.scannedAt.slice(0,10);
    byDate.set(date,(byDate.get(date)??0)+1);
    countries.set(scan.country,(countries.get(scan.country)??0)+1);
    const city = scan.city === "Unknown" ? "Unknown" : `${scan.city}, ${scan.country}`;
    cities.set(city,(cities.get(city)??0)+1);
    devices.set(scan.device,(devices.get(scan.device)??0)+1);
    perCode.set(scan.codeId,(perCode.get(scan.codeId)??0)+1);
    const code = codeMap.get(scan.codeId)!;
    const event = code.event || "No event label";
    const book = code.book || "No book label";
    events.set(event,(events.get(event)??0)+1);
    books.set(book,(books.get(book)??0)+1);
  }
  const entries = (map:Map<string,number>)=>[...map].map(([name,scans])=>({name,scans})).sort((a,b)=>b.scans-a.scans);
  return {
    totalScans:filtered.length,
    activeCodes:codes.filter(c=>isAvailable(c,now.getTime())).length,
    countries:[...countries.keys()].filter(c=>c!=="Unknown").length,
    periodDays,
    byDay:[...byDate].map(([date,scans])=>({date,scans})),
    byCountry:entries(countries), byCity:entries(cities), byDevice:entries(devices),
    byEvent:entries(events), byBook:entries(books),
    byCode:codes.map(c=>({id:c.id,name:c.name,scans:perCode.get(c.id)??0})).sort((a,b)=>b.scans-a.scans),
    recent:[...filtered].sort((a,b)=>b.scannedAt.localeCompare(a.scannedAt)).slice(0,100).map(s=>({...s,codeName:codeMap.get(s.codeId)!.name})),
  };
}
