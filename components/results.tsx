"use client";

import { useEffect, useMemo, useState } from "react";
import { ScanChart } from "./scan-chart";
import { Icon, Segmented, api, downloadCSV, formatNumber, formatTime } from "./ui";
import type { Analytics, FulfillmentMetrics, FulfillmentReport, FulfillmentResponse, QRCodeRecord } from "@/lib/types";

const METRICS: (keyof FulfillmentMetrics)[] = ["requests", "booksRequested", "booksShipped", "deliveredOrders", "needsAttention"];
const zero = (): FulfillmentMetrics => ({ requests: 0, booksRequested: 0, booksShipped: 0, deliveredOrders: 0, needsAttention: 0 });
function add(target: FulfillmentMetrics, source: FulfillmentMetrics) { for (const key of METRICS) target[key] += source[key]; }

type FulfillmentState = { query: string; response: FulfillmentResponse | null; error: string; loading: boolean };

/**
 * Fulfillment results for a filter query. A failed refresh keeps the last
 * successful report for the same filters; a filter change never shows stale counts.
 */
export function useFulfillment(query: string, refresh: number, revision: string) {
  const [state, setState] = useState<FulfillmentState>({ query: "", response: null, error: "", loading: true });
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setState(previous => ({ query, response: previous.query === query ? previous.response : null, error: "", loading: true }));
    void (async () => {
      try {
        const response = await fetch(`/api/fulfillment?${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Book request results are temporarily unavailable.");
        const result = await response.json() as FulfillmentResponse;
        if (result.status === "unavailable") throw new Error(result.message || "Book request results are temporarily unavailable.");
        if (result.status !== "connected" && result.status !== "not_configured") throw new Error("Book request results could not be read.");
        if (result.status === "connected" && !result.report) throw new Error("Book request results could not be read.");
        if (current) setState({ query, response: result, error: "", loading: false });
      } catch (error) {
        if (current) setState(previous => ({ query, response: previous.query === query ? previous.response : null, error: error instanceof Error ? error.message : "Book request results are temporarily unavailable.", loading: false }));
      }
    })();
    return () => { current = false; controller.abort(); };
  }, [query, refresh, revision]);
  const current = state.query === query;
  const response = current ? state.response : null;
  return {
    response,
    report: response?.status === "connected" ? response.report : null,
    notConfigured: response?.status === "not_configured",
    loading: !current || state.loading,
    error: current ? state.error : "",
  };
}

type Row = { key: string; name: string; detail?: string; scans: number; metrics: FulfillmentMetrics | null; earlier: { label: string; metrics: FulfillmentMetrics }[] };
type Group = "event" | "code" | "book";

export function comparisonRows(group: Group, analytics: Analytics | null, report: FulfillmentReport | null, codes: QRCodeRecord[]): Row[] {
  const rows = new Map<string, Row>();
  const ensure = (key: string, name: string, detail?: string) => {
    let row = rows.get(key);
    if (!row) { row = { key, name, detail, scans: 0, metrics: null, earlier: [] }; rows.set(key, row); }
    return row;
  };
  const metricsOf = (row: Row) => row.metrics ?? (row.metrics = zero());
  const byId = new Map(codes.map(code => [code.id, code]));
  if (group === "event") {
    for (const item of analytics?.byEvent ?? []) ensure(item.name, item.name).scans += item.scans;
    for (const item of report?.byCode ?? []) {
      const frozen = item.event || "No event label";
      const code = byId.get(item.codeId);
      const current = code ? code.event || "No event label" : frozen;
      const row = ensure(current, current);
      if (frozen === current) add(metricsOf(row), item);
      else {
        let earlier = row.earlier.find(entry => entry.label === frozen);
        if (!earlier) { earlier = { label: frozen, metrics: zero() }; row.earlier.push(earlier); }
        add(earlier.metrics, item);
      }
    }
  } else if (group === "code") {
    const label = (id: string, fallback: string) => { const code = byId.get(id); return code ? `${code.name}${code.archivedAt ? " (archived)" : ""}` : fallback; };
    const detail = (id: string) => { const code = byId.get(id); return code ? [code.event, code.placement].filter(Boolean).join(" · ") : undefined; };
    for (const item of analytics?.byCode ?? []) ensure(item.id, label(item.id, item.name), detail(item.id)).scans += item.scans;
    for (const item of report?.byCode ?? []) add(metricsOf(ensure(item.codeId, label(item.codeId, "QR code"), detail(item.codeId))), item);
  } else {
    for (const item of analytics?.byBook ?? []) ensure(item.name, item.name).scans += item.scans;
    for (const item of report?.byCode ?? []) { const name = item.book || "No book label"; add(metricsOf(ensure(name, name)), item); }
  }
  const requests = (row: Row) => (row.metrics?.requests ?? 0) + row.earlier.reduce((sum, entry) => sum + entry.metrics.requests, 0);
  return [...rows.values()].filter(row => row.scans || row.metrics || row.earlier.length).sort((a, b) => b.scans - a.scans || requests(b) - requests(a) || a.name.localeCompare(b.name));
}

function Bars({ rows, unit }: { rows: { name: string; value: number }[]; unit?: (value: number) => string }) {
  if (!rows.length) return <p className="empty-line">Nothing recorded in this period.</p>;
  const max = Math.max(1, ...rows.map(row => row.value));
  return <ul className="bars">{rows.slice(0, 6).map((row, index) => <li key={`${row.name}-${index}`}>
    <span className="bar-name">{row.name || "Unknown"}</span><span className="bar-value">{unit ? unit(row.value) : formatNumber(row.value)}</span>
    <span className="bar-track" aria-hidden="true"><span style={{ width: `${(row.value / max) * 100}%` }} /></span>
  </li>)}</ul>;
}

const plural = (value: number, word: string) => `${formatNumber(value)} ${word}${value === 1 ? "" : "s"}`;

export type ResultsFilters = { days: string; event: string; codeId: string };

export function Results({ codes, filters, onFilters, historical, onHistorical }: {
  codes: QRCodeRecord[];
  filters: ResultsFilters;
  onFilters: (next: ResultsFilters) => void;
  historical: { codeId: string; event: string }[];
  onHistorical: (rows: { codeId: string; event: string }[]) => void;
}) {
  const query = `days=${filters.days}${filters.event ? `&event=${encodeURIComponent(filters.event)}` : ""}${filters.codeId ? `&codeId=${encodeURIComponent(filters.codeId)}` : ""}`;
  const [refresh, setRefresh] = useState(0);
  const revision = codes.map(code => `${code.id}:${code.updatedAt}:${code.archivedAt ?? ""}`).join("|");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsKey, setAnalyticsKey] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [group, setGroup] = useState<Group>("event");
  const [scanBreakdown, setScanBreakdown] = useState<"country" | "city" | "device">("country");
  const [shipBreakdown, setShipBreakdown] = useState<"country" | "city">("country");
  const fulfillment = useFulfillment(query, refresh, revision);

  useEffect(() => {
    let current = true;
    setAnalyticsLoading(true); setAnalyticsError("");
    api<Analytics>(`/api/analytics?${query}`)
      .then(data => { if (current) { setAnalytics(data); setAnalyticsKey(query); setUpdatedAt(Date.now()); } })
      .catch(error => { if (current) setAnalyticsError(error instanceof Error ? error.message : "Scan results are temporarily unavailable."); })
      .finally(() => { if (current) setAnalyticsLoading(false); });
    return () => { current = false; };
  }, [query, refresh, revision]);

  useEffect(() => {
    if (fulfillment.report && !filters.event && !filters.codeId) onHistorical(fulfillment.report.byCode.map(row => ({ codeId: row.codeId, event: row.event })));
  }, [fulfillment.report, filters.event, filters.codeId, onHistorical]);

  const scans = analyticsKey === query ? analytics : null;
  const report = fulfillment.report;
  const loading = analyticsLoading || fulfillment.loading;
  const rows = useMemo(() => comparisonRows(group, scans, report, codes), [group, scans, report, codes]);
  const currentEvents = new Set(codes.map(code => code.event).filter(Boolean));
  const eventOptions = [...new Set([...codes.map(code => code.event), ...historical.map(item => item.event), filters.event].filter(Boolean))].sort();
  const codeOptions = codes.filter(code => !filters.event || code.event === filters.event || historical.some(item => item.codeId === code.id && item.event === filters.event));
  const failedRefresh = (fulfillment.error && report) || (analyticsError && scans);
  const showFulfillment = !fulfillment.notConfigured;
  const totals = report?.totals;
  const untracked = report?.coverage.untrackedDeliveryRequests ?? 0;
  const value = (number: number | undefined) => number === undefined ? "—" : formatNumber(number);
  const scanRows = scans ? (scanBreakdown === "country" ? scans.byCountry : scanBreakdown === "city" ? scans.byCity : scans.byDevice).map(row => ({ name: row.name, value: row.scans })) : [];
  const shipRows = report ? (shipBreakdown === "country" ? report.byCountry : report.byCity).map(row => ({ name: row.name, value: row.requests })) : [];

  return <div className="page results">
    <div className="page-head">
      <h1>Results</h1>
      <div className="filters">
        <label className="sr-only" htmlFor="results-period">Period</label>
        <select id="results-period" aria-label="Analytics period" value={filters.days} onChange={event => onFilters({ ...filters, days: event.target.value })}>
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 365 days</option>
        </select>
        <label className="sr-only" htmlFor="results-event">Event</label>
        <select id="results-event" aria-label="Filter analytics by event" value={filters.event} onChange={event => onFilters({ ...filters, event: event.target.value, codeId: "" })}>
          <option value="">All events</option>
          {eventOptions.map(event => <option key={event} value={event}>{currentEvents.has(event) ? event : `${event} (earlier label)`}</option>)}
        </select>
        <label className="sr-only" htmlFor="results-code">QR code</label>
        <select id="results-code" aria-label="Filter analytics by QR code" value={filters.codeId} onChange={event => onFilters({ ...filters, codeId: event.target.value })}>
          <option value="">All codes</option>
          {codeOptions.map(code => <option key={code.id} value={code.id}>{code.name}{code.archivedAt ? " (archived)" : ""}</option>)}
        </select>
      </div>
      <div className="refresh">
        {failedRefresh ? <span className="refresh-failed" role="status">Couldn&rsquo;t refresh · showing {updatedAt ? formatTime(updatedAt) : "earlier results"}</span>
          : updatedAt && !loading ? <span>Updated {formatTime(updatedAt)}</span> : loading ? <span role="status">Refreshing…</span> : null}
        <button type="button" className="icon-button" aria-label="Refresh analytics" title="Refresh" disabled={loading} onClick={() => setRefresh(value => value + 1)}><Icon name="refresh" size={18} /></button>
      </div>
    </div>

    {analyticsError && !scans && <p className="inline-alert" role="alert">{analyticsError}</p>}
    {fulfillment.error && !report && showFulfillment && <p className="inline-alert" role="alert">{fulfillment.error} Use Refresh to try again.</p>}
    {filters.event && !currentEvents.has(filters.event) && <p className="help">Book requests keep the event label they were made under. Scans use each code&rsquo;s current label.</p>}

    <section aria-label="Outcomes" className="outcomes">
      {report?.preview && <div className="outcome-note"><span className="tag simulated">Book requests simulated in preview</span>{fulfillment.response?.previewOrigin && <a href={`${fulfillment.response.previewOrigin}/qr-preview`} target="_blank" rel="noopener noreferrer">Test requests <Icon name="external" size={14} /></a>}</div>}
      <dl className={`kpis ${showFulfillment ? "" : "scans-only"}`}>
        <div data-metric="scans"><dt>Scans</dt><dd>{value(scans?.totalScans)}</dd><span>Link visits</span></div>
        {showFulfillment ? <>
          <div data-metric="requests"><dt>Requests</dt><dd>{value(totals?.requests)}</dd><span>Form submissions</span></div>
          <div data-metric="booksRequested"><dt>Books requested</dt><dd>{value(totals?.booksRequested)}</dd><span>Copies</span></div>
          <div data-metric="booksShipped"><dt>Books shipped</dt><dd>{value(totals?.booksShipped)}</dd><span>Copies</span></div>
          <div data-metric="deliveredOrders"><dt>Delivered</dt><dd>{value(totals?.deliveredOrders)}</dd><span>Requests{untracked ? ` · ${formatNumber(untracked)} untracked` : ""}</span></div>
          <div data-metric="needsAttention" className={totals?.needsAttention ? "attention" : undefined}><dt>Need attention</dt><dd>{value(totals?.needsAttention)}</dd><span>Requests</span></div>
        </> : <p className="kpi-note">Book requests aren&rsquo;t connected in this environment.</p>}
      </dl>
    </section>

    <section className="panel" aria-labelledby="per-day-heading">
      <div className="panel-head"><h2 id="per-day-heading">Scans per day</h2><span className="help">UTC</span></div>
      {scans ? <>
        <ScanChart days={scans.byDay} />
        <details className="inline-details"><summary>Daily counts</summary>
          <div className="table-scroll"><table className="compact-table"><thead><tr><th scope="col">Date (UTC)</th><th scope="col" className="num">Scans</th></tr></thead>
            <tbody>{scans.byDay.map(day => <tr key={day.date}><td>{day.date}</td><td className="num">{formatNumber(day.scans)}</td></tr>)}</tbody></table></div>
        </details>
      </> : <p className="empty-line" role="status">{analyticsLoading ? "Loading scans…" : "Scans are unavailable."}</p>}
    </section>

    <section className="panel" aria-labelledby="by-heading">
      <div className="panel-head"><h2 id="by-heading">By {group === "code" ? "code" : group}</h2>
        <Segmented label="Compare by" value={group} onChange={setGroup} options={[{ value: "event", label: "Event" }, { value: "code", label: "Code" }, { value: "book", label: "Book" }]} />
      </div>
      {rows.length ? <table className="by-table">
        <thead><tr><th scope="col">{group === "event" ? "Event" : group === "code" ? "QR code" : "Book label"}</th><th scope="col" className="num">Scans</th>
          {showFulfillment && <><th scope="col" className="num">Requests</th><th scope="col" className="num">Books requested</th><th scope="col" className="num">Books shipped</th><th scope="col" className="num">Delivered</th><th scope="col" className="num">Attention</th></>}</tr></thead>
        <tbody>{rows.map(row => [
          <tr key={row.key} className={row.earlier.length ? "has-earlier" : undefined}>
            <th scope="row"><span className="row-name">{row.name}</span>{row.detail && <span className="row-detail">{row.detail}</span>}</th>
            <td className="num" data-label="Scans">{formatNumber(row.scans)}</td>
            {showFulfillment && METRICS.map(key => <td key={key} className={`num ${key === "needsAttention" && row.metrics?.needsAttention ? "attention" : ""}`} data-label={{ requests: "Requests", booksRequested: "Books requested", booksShipped: "Books shipped", deliveredOrders: "Delivered", needsAttention: "Attention" }[key]}>{row.metrics ? formatNumber(row.metrics[key]) : report ? "—" : ""}</td>)}
          </tr>,
          ...row.earlier.map(entry => <tr key={`${row.key}-${entry.label}`} className="earlier">
            <th scope="row"><span className="row-detail">Requested under its earlier label “{entry.label}”</span></th>
            <td className="num" data-label="Scans" />
            {METRICS.map(key => <td key={key} className={`num ${key === "needsAttention" && entry.metrics.needsAttention ? "attention" : ""}`} data-label={{ requests: "Requests", booksRequested: "Books requested", booksShipped: "Books shipped", deliveredOrders: "Delivered", needsAttention: "Attention" }[key]}>{formatNumber(entry.metrics[key])}</td>)}
          </tr>),
        ])}</tbody>
      </table> : <p className="empty-line">{loading ? "Loading…" : "No scans or book requests in this period."}</p>}
    </section>

    <div className="geo">
      <section className="panel" aria-labelledby="scan-places-heading">
        <div className="panel-head"><div><h2 id="scan-places-heading">Where scans came from</h2><p className="help">Approximate, from the scanner&rsquo;s network</p></div>
          <Segmented label="Break down scans by" value={scanBreakdown} onChange={setScanBreakdown} options={[{ value: "country", label: "Country" }, { value: "city", label: "City" }, { value: "device", label: "Device" }]} /></div>
        <Bars rows={scanRows} />
      </section>
      {showFulfillment && <section className="panel" aria-labelledby="ship-places-heading">
        <div className="panel-head"><div><h2 id="ship-places-heading">Where books were sent</h2><p className="help">Shipping addresses on requests</p></div>
          <Segmented label="Group shipping destinations by" value={shipBreakdown} onChange={setShipBreakdown} options={[{ value: "country", label: "Country" }, { value: "city", label: "City" }]} /></div>
        <Bars rows={shipRows} unit={number => plural(number, "request")} />
      </section>}
    </div>

    {scans && <details className="panel recent">
      <summary><span>Recent scans</span><span className="help">{scans.recent[0] ? `Latest ${new Date(scans.recent[0].scannedAt).toLocaleString()} · ${scans.recent[0].codeName}` : "None in this period"}</span><Icon name="chevron" size={18} /></summary>
      {scans.recent.length ? <>
        <div className="table-scroll"><table className="compact-table recent-table"><thead><tr><th scope="col">QR code</th><th scope="col">When</th><th scope="col">Location</th><th scope="col">Device</th></tr></thead>
          <tbody>{scans.recent.map(scan => <tr key={scan.id}><td data-label="QR code">{scan.codeName}</td><td data-label="When"><time dateTime={scan.scannedAt}>{new Date(scan.scannedAt).toLocaleString()}</time></td><td data-label="Location">{[scan.city, scan.country].filter(part => part && part !== "Unknown").join(", ") || "Unknown"}</td><td data-label="Device">{scan.device}</td></tr>)}</tbody></table></div>
        <button type="button" className="btn" onClick={() => downloadCSV("mastra-recent-scans.csv", [["Timestamp", "QR code", "Country", "Region", "City", "Device"], ...scans.recent.map(scan => [scan.scannedAt, scan.codeName, scan.country, scan.region, scan.city, scan.device])])}><Icon name="download" />Export CSV</button>
      </> : <p className="empty-line">Visits appear here after a saved link is opened.</p>}
    </details>}

    <p className="footnote">Scans are visits to a tracking link, not people, and can include automated previews. A request for 20 of both books counts as 1 request and 40 books.</p>
  </div>;
}
