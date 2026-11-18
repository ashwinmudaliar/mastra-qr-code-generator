"use client";

import { type RefObject } from "react";
import { QRPreview } from "./qr-preview";
import { useFulfillment } from "./results";
import { Icon, Menu, destinationLabel, downloadCSV, formatDate, formatNumber, type MenuItem } from "./ui";
import { trackingLink } from "@/lib/tracking-link";
import type { QRCodeRecord } from "@/lib/types";

export type CodeFilter = "current" | "active" | "paused" | "expired" | "archived";
export const isExpired = (code: QRCodeRecord) => !!code.expiresAt && new Date(code.expiresAt).getTime() < Date.now();
export function statusOf(code: QRCodeRecord): { key: "active" | "paused" | "expired" | "archived"; label: string } {
  if (code.archivedAt) return { key: "archived", label: `Archived ${formatDate(code.archivedAt)}` };
  if (code.status === "paused") return { key: "paused", label: "Paused" };
  if (isExpired(code)) return { key: "expired", label: `Expired ${formatDate(code.expiresAt!)}` };
  return { key: "active", label: "Active" };
}

export type CodeActions = {
  edit: (code: QRCodeRecord) => void;
  duplicate: (code: QRCodeRecord) => void;
  toggleStatus: (code: QRCodeRecord) => void;
  archive: (code: QRCodeRecord) => void;
  restore: (code: QRCodeRecord) => void;
  results: (code: QRCodeRecord) => void;
  copy: (code: QRCodeRecord) => void;
  download: (code: QRCodeRecord) => void;
  stickers: (code: QRCodeRecord) => void;
};

export function CodesList({ codes, origin, loading, busy, search, onSearch, filter, onFilter, onNew, actions, filterRef }: {
  codes: QRCodeRecord[]; origin: string; loading: boolean; busy: boolean;
  search: string; onSearch: (value: string) => void; filter: CodeFilter; onFilter: (value: CodeFilter) => void;
  onNew: () => void; actions: CodeActions; filterRef: RefObject<HTMLSelectElement | null>;
}) {
  const revision = codes.map(code => `${code.id}:${code.updatedAt}:${code.archivedAt ?? ""}`).join("|");
  const fulfillment = useFulfillment("days=366", 0, revision);
  const requests = new Map<string, number>();
  for (const row of fulfillment.report?.byCode ?? []) requests.set(row.codeId, (requests.get(row.codeId) ?? 0) + row.requests);
  const showRequests = !!fulfillment.report;
  const current = codes.filter(code => !code.archivedAt);
  const term = search.trim().toLowerCase();
  const visible = codes.filter(code => {
    const status = statusOf(code).key;
    const matchesFilter = filter === "archived" ? status === "archived" : status !== "archived" && (filter === "current" || status === filter);
    return matchesFilter && `${code.name} ${code.event} ${code.book} ${code.placement} ${code.destination}`.toLowerCase().includes(term);
  });
  const groups = new Map<string, QRCodeRecord[]>();
  for (const code of visible) { const key = code.event || "No event"; groups.set(key, [...(groups.get(key) ?? []), code]); }
  const onlyArchived = codes.length > 0 && !current.length && filter === "current" && !term;
  const sum = (items: QRCodeRecord[], pick: (code: QRCodeRecord) => number) => items.reduce((total, code) => total + pick(code), 0);

  function menuFor(code: QRCodeRecord): MenuItem[] {
    if (code.archivedAt) return [{ label: "Restore", onSelect: () => actions.restore(code) }, { label: "View results", onSelect: () => actions.results(code) }];
    return [
      { label: "Edit", onSelect: () => actions.edit(code) },
      { label: "Duplicate", onSelect: () => actions.duplicate(code) },
      { label: "Sticker sheet…", onSelect: () => actions.stickers(code) },
      { label: code.status === "active" ? "Pause" : "Activate", onSelect: () => actions.toggleStatus(code) },
      { label: "View results", onSelect: () => actions.results(code) },
      { label: "Archive…", onSelect: () => actions.archive(code), danger: true },
    ];
  }

  return <div className="page codes">
    <div className="page-head">
      <h1>Codes <span className="count">{formatNumber(current.length)}</span></h1>
      <div className="filters">
        <div className="search"><Icon name="search" /><label className="sr-only" htmlFor="code-search">Search QR codes</label><input id="code-search" type="search" placeholder="Search codes" value={search} onChange={event => onSearch(event.target.value)} /></div>
        <label className="sr-only" htmlFor="code-filter">Show</label>
        <select id="code-filter" ref={filterRef} aria-label="Filter QR code status" value={filter} onChange={event => onFilter(event.target.value as CodeFilter)}>
          <option value="current">Current codes</option><option value="active">Active</option><option value="paused">Paused</option><option value="expired">Expired</option><option value="archived">Archived</option>
        </select>
      </div>
      <button type="button" className="btn primary" disabled={busy} onClick={onNew}><Icon name="plus" />New code</button>
    </div>
    {filter === "archived" && <p className="help">Archived codes don&rsquo;t open, but their scans and book requests stay in Results. Restoring a code leaves it paused.</p>}

    {loading && !codes.length ? <p className="empty-line" role="status">Loading your QR codes…</p>
      : !visible.length ? <div className="empty">
        <h2>{onlyArchived ? "No current codes" : codes.length ? "No matching codes" : "No codes yet"}</h2>
        <p>{onlyArchived ? "Your archived codes and their history are still available." : codes.length ? "Try another search or filter." : "Create a code for each event and placement, so Results can tell them apart."}</p>
        <button type="button" className="btn primary" disabled={busy} onClick={onlyArchived ? () => onFilter("archived") : codes.length ? () => { onSearch(""); onFilter("current"); } : onNew}>{onlyArchived ? "View archived codes" : codes.length ? "Clear filters" : <><Icon name="plus" />New code</>}</button>
      </div>
      : <>
        <table className="codes-table">
          <thead><tr><th scope="col"><span className="sr-only">Artwork</span></th><th scope="col">Code</th><th scope="col">Destination</th><th scope="col" className="num">Scans</th>{showRequests && <th scope="col" className="num">Requests</th>}<th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          {[...groups].map(([event, items]) => <tbody key={event}>
            <tr className="group-row"><th scope="rowgroup" colSpan={showRequests ? 7 : 6}><span className="group-name">{event}</span><span className="group-meta">{[`${items.length} code${items.length === 1 ? "" : "s"}`, `${formatNumber(sum(items, code => code.scans))} scans`, showRequests ? `${formatNumber(sum(items, code => requests.get(code.id) ?? 0))} requests` : ""].filter(Boolean).join(" · ")}</span></th></tr>
            {items.map(code => {
              const status = statusOf(code);
              return <tr key={code.id} className={code.archivedAt ? "archived" : undefined}>
                <td className="thumb-cell"><QRPreview value={trackingLink(origin, code.slug)} design={code.design} size={40} className="thumb" /></td>
                <td className="code-cell">
                  {code.archivedAt ? <span className="code-name">{code.name}</span> : <button type="button" className="code-name" disabled={busy} onClick={() => actions.edit(code)}>{code.name}</button>}
                  <span className="code-sub">{[code.placement, code.book].filter(Boolean).join(" · ") || "No placement"}</span>
                </td>
                <td className="dest-cell" data-label="Destination"><span title={code.destination}>{destinationLabel(code.destination)}</span></td>
                <td className="num" data-label="Scans">{formatNumber(code.scans)}</td>
                {showRequests && <td className="num" data-label="Requests">{formatNumber(requests.get(code.id) ?? 0)}</td>}
                <td data-label="Status"><span className={`status status-${status.key}`}>{status.label}</span></td>
                <td className="actions-cell">
                  {!code.archivedAt && <>
                    <button type="button" className="icon-button" aria-label={`Download ${code.name} as PNG`} title="Download PNG" disabled={busy} onClick={() => actions.download(code)}><Icon name="download" size={18} /></button>
                    <button type="button" className="icon-button" aria-label={`Copy link for ${code.name}`} title="Copy tracking link" onClick={() => actions.copy(code)}><Icon name="copy" size={18} /></button>
                  </>}
                  {code.archivedAt && <button type="button" className="btn small" aria-label={`Restore ${code.name}`} disabled={busy} onClick={() => actions.restore(code)}>Restore</button>}
                  <Menu label={`More actions for ${code.name}`} items={menuFor(code)} disabled={busy} />
                </td>
              </tr>;
            })}
          </tbody>)}
        </table>
        <div className="table-foot">
          <p className="help">Scans are all-time.{showRequests ? " Requests count visits from the last 12 months." : ""}</p>
          <button type="button" className="btn ghost" onClick={() => downloadCSV("mastra-qr-codes.csv", [["Name", "Event", "Book", "Placement", "Status", "Scans", ...(showRequests ? ["Requests (12 months)"] : []), "Tracking link", "Destination"], ...visible.map(code => [code.name, code.event, code.book, code.placement, statusOf(code).label, code.scans, ...(showRequests ? [requests.get(code.id) ?? 0] : []), trackingLink(origin, code.slug), code.destination])])}><Icon name="download" />Export CSV</button>
        </div>
      </>}
  </div>;
}
