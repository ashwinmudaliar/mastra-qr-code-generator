"use client";

import { useEffect, useState } from "react";
import type { FulfillmentMetrics, FulfillmentReport, FulfillmentResponse, QRCodeRecord } from "@/lib/types";

const metrics: { key: keyof FulfillmentMetrics; label: string }[] = [
  { key: "requests", label: "Requests received" },
  { key: "booksRequested", label: "Books requested" },
  { key: "booksShipped", label: "Books shipped" },
  { key: "deliveredOrders", label: "Delivered orders" },
  { key: "needsAttention", label: "Needs attention" },
];

type ReportState = { query: string; response: FulfillmentResponse | null; error: string; loading: boolean };
type Comparison = FulfillmentMetrics & { key: string; name: string; detail: string };

function comparisons(report: FulfillmentReport, group: "event" | "code", codes: QRCodeRecord[]): Comparison[] {
  const names = new Map(codes.map(code => [code.id, code.name]));
  const rows = new Map<string, Comparison>();
  for (const item of report.byCode) {
    // Attribution labels belong to the saved request, even after a code is edited.
    const key = group === "event" ? item.event : JSON.stringify([item.codeId, item.event, item.book, item.placement]);
    const existing = rows.get(key);
    if (existing) {
      for (const { key: metric } of metrics) existing[metric] += item[metric];
    } else {
      rows.set(key, {
        ...item, key,
        name: group === "event" ? item.event || "No event label" : names.get(item.codeId) || "QR code",
        detail: group === "event" ? "" : [item.event, item.book, item.placement].filter(Boolean).join(" · "),
      });
    }
  }
  return [...rows.values()].sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name));
}

function Metrics({ values, compact = false }: { values: FulfillmentMetrics; compact?: boolean }) {
  return <dl className={compact ? "fulfillment-row-metrics" : "fulfillment-metrics"}>
    {metrics.map(({ key, label }) => <div key={key} data-metric={key}><dt>{label}</dt><dd>{values[key].toLocaleString()}</dd></div>)}
  </dl>;
}

export function FulfillmentSummary({ query, refresh, revision, codes, onLoadingChange, onCampaignsLoaded }: {
  query: string;
  refresh: number;
  revision: string;
  codes: QRCodeRecord[];
  onLoadingChange: (loading: boolean) => void;
  onCampaignsLoaded: (campaigns: { codeId: string; event: string }[]) => void;
}) {
  const [state, setState] = useState<ReportState>({ query: "", response: null, error: "", loading: true });
  const [group, setGroup] = useState<"event" | "code">("event");
  const [destination, setDestination] = useState<"country" | "city">("country");

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    onLoadingChange(true);
    setState(previous => ({ query, response: previous.query === query ? previous.response : null, error: "", loading: true }));
    void (async () => {
      try {
        const response = await fetch(`/api/fulfillment?${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Fulfillment results are temporarily unavailable.");
        const result = await response.json() as FulfillmentResponse;
        if (result.status === "unavailable") throw new Error(result.message || "Fulfillment results are temporarily unavailable.");
        if (result.status !== "connected" && result.status !== "not_configured") throw new Error("Fulfillment results could not be read.");
        if (result.status === "connected" && !result.report) throw new Error("Fulfillment results could not be read.");
        if (current) {
          setState({ query, response: result, error: "", loading: false });
          const filters = new URLSearchParams(query);
          if (result.report && !filters.has("event") && !filters.has("codeId")) onCampaignsLoaded(result.report.byCode.map(row => ({ codeId: row.codeId, event: row.event })));
        }
      } catch (error) {
        if (current) setState(previous => ({ query, response: previous.query === query ? previous.response : null, error: error instanceof Error ? error.message : "Fulfillment results are temporarily unavailable.", loading: false }));
      } finally {
        if (current) onLoadingChange(false);
      }
    })();
    return () => { current = false; controller.abort(); onLoadingChange(false); };
  }, [query, refresh, revision, onLoadingChange, onCampaignsLoaded]);

  const current = state.query === query;
  const result = current ? state.response : null;
  const report = result?.status === "connected" ? result.report : null;
  const loading = !current || state.loading;
  const error = current ? state.error : "";
  const rows = report ? comparisons(report, group, codes) : [];
  const places = report ? destination === "country" ? report.byCountry : report.byCity : [];

  return <section className="chart-card fulfillment-summary" aria-labelledby="fulfillment-heading" aria-busy={loading}>
    <div className="card-heading">
      <div><h2 id="fulfillment-heading">Book fulfillment</h2><p>Results from QR visits in the selected period.</p></div>
      {report && <span className="fulfillment-updated">{loading ? "Refreshing…" : <>Updated <time dateTime={report.updatedAt}>{new Date(report.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></>}</span>}
    </div>
    {error && <p className="fulfillment-warning" role="status">{error}{report ? " Showing the last successful report for these filters." : " Use Refresh to try again."}</p>}
    {loading && !report && <p className="fulfillment-message" role="status">Loading fulfillment results…</p>}
    {!loading && !error && result?.status === "not_configured" && <p className="fulfillment-message">Fulfillment reporting is not connected in this environment.</p>}
    {report && <>
      {report.preview && <div className="fulfillment-preview"><div><strong>Simulated fulfillment</strong><p>No books or emails are sent from this private preview.</p></div>{result?.previewOrigin && <a className="btn secondary" href={`${result.previewOrigin}/qr-preview`} target="_blank" rel="noopener noreferrer">Open test requests ↗</a>}</div>}
      <Metrics values={report.totals} />
      <p className="fulfillment-definition">A request for 20 books counts as one request and 20 books. Shipment and delivery results may arrive after the selected period.</p>
      {report.coverage.untrackedDeliveryRequests > 0 && <p className="fulfillment-warning">Delivery tracking is unavailable for {report.coverage.untrackedDeliveryRequests.toLocaleString()} attributed request{report.coverage.untrackedDeliveryRequests === 1 ? "" : "s"}; those are not counted as delivered.</p>}
      {report.totals.requests === 0 ? <div className="fulfillment-empty"><h3>No attributed requests yet</h3><p>Open a saved Books QR link and submit the form to connect a request to its code.</p></div> : <>
        <div className="fulfillment-comparison-heading"><h3>{group === "event" ? "Results by event" : "Results by QR code"}</h3><label className="fulfillment-selector">Compare by<select value={group} onChange={event => setGroup(event.target.value as typeof group)}><option value="event">Event</option><option value="code">QR code</option></select></label></div>
        <ul className="fulfillment-comparisons" aria-label={group === "event" ? "Fulfillment by event" : "Fulfillment by QR code"}>{rows.map(row => <li key={row.key}><div className="fulfillment-row-name"><strong>{row.name}</strong>{row.detail && <p>{row.detail}</p>}</div><Metrics values={row} compact /></li>)}</ul>
        <details className="fulfillment-destinations"><summary>Shipping destinations</summary><div className="fulfillment-destination-heading"><p>Where books were requested, separate from scan location.</p><label className="fulfillment-selector">Group by<select value={destination} onChange={event => setDestination(event.target.value as typeof destination)}><option value="country">Country</option><option value="city">City</option></select></label></div><ul aria-label={`Shipping ${destination === "country" ? "countries" : "cities"}`}>{places.map((place, index) => <li key={`${place.name}-${index}`}><span>{place.name || "Unknown"}</span><span>{place.requests.toLocaleString()} request{place.requests === 1 ? "" : "s"}</span></li>)}</ul>{!places.length && <p className="fulfillment-definition">No shipping destination information is available.</p>}</details>
      </>}
    </>}
  </section>;
}
