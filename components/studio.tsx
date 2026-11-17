"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { QRPreview } from "./qr-preview";
import { DEFAULT_DESIGN, DESIGN_PRESETS, getDesignWarnings, type QRDesign } from "@/lib/qr-design";
import { exportQR, normalizeLogo, type ExportFormat } from "@/lib/qr-export";
import type { Analytics, QRCodeInput, QRCodeRecord, SessionInfo } from "@/lib/types";

type View = "create" | "library" | "analytics" | "guide";
type Tab = "content" | "design" | "tracking";
const books = ["Both books", "Principles of Building AI Agents", "Patterns for Building AI Agents"];
const initialForm = (): QRCodeInput => ({ name: "", destination: "https://www.mastrabooks.dev", event: "", book: "Both books", placement: "", status: "active", expiresAt: null, design: { ...DEFAULT_DESIGN }, utm: { enabled: true, source: "event", medium: "qr", campaign: "", content: "" } });

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "Something went wrong. Please try again.");
  return data;
}
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    qr: <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><path d="M15 15h3v3h3M15 21v-3M21 15v-3M12 3v3M3 12h5M12 9v6" /></>,
    chart: <><path d="M4 4v16h16M8 15v-4M13 15V7M18 15v-6" /></>,
    palette: <><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4c-1-1 0-3 2-3h2a3 3 0 0 0 3-3 9 9 0 0 0-9-8Z" /><path d="M7 10h.01M10 7h.01M15 7h.01M6 14h.01" /></>,
    book: <><path d="M12 5v15M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a18 18 0 0 0 0 18 18 18 0 0 0 0-18Z" /></>,
    link: <><path d="m10 13 4-4M8 15l-2 2a4 4 0 0 1-5-5l4-4a4 4 0 0 1 5 0M14 9l2-2a4 4 0 0 1 5 5l-4 4a4 4 0 0 1-5 0" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    edit: <><path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15Z" /></>,
    chevron: <path d="m8 5 7 7-7 7" />,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
    sparkle: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    logout: <><path d="M9 4H4v16h5M9 12h12m-5-5 5 5-5 5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.qr}</svg>;
}
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}{hint && <small className="field-help">{hint}</small>}</label>; }
function downloadCSV(name: string, rows: unknown[][]) {
  const text = rows.map(row => row.map(cell => { let v = String(cell ?? ""); if (/^[=+@\-\t\r]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const campaignLabel = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160);
const fmtDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function Studio() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [view, setView] = useState<View>("create");
  const [tab, setTab] = useState<Tab>("content");
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">("edit");
  const mobileSwitcher = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [form, setForm] = useState<QRCodeInput>(initialForm);
  const [savedInput, setSavedInput] = useState<QRCodeInput>(initialForm);
  const [editing, setEditing] = useState<QRCodeRecord | null>(null);
  const [codes, setCodes] = useState<QRCodeRecord[]>([]);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [days, setDays] = useState("30");
  const [filterCode, setFilterCode] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [mobileBreakdown, setMobileBreakdown] = useState<"country" | "city" | "device">("country");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState("");
  const [bulkResult, setBulkResult] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<QRCodeRecord | null>(null);
  const [exportSize, setExportSize] = useState("2048");
  const logoInput = useRef<HTMLInputElement>(null);
  const warnings = getDesignWarnings(form.design);
  const hasUnsavedChanges = JSON.stringify(form) !== JSON.stringify(savedInput);
  const readyToDownload = Boolean(editing) && !hasUnsavedChanges;
  const deleteDialog = useRef<HTMLDivElement>(null);

  async function refreshSession() {
    try { const data = await api<SessionInfo>("/api/session"); setSession(data); setSessionError(""); }
    catch (e) { setSessionError(e instanceof Error ? e.message : "Could not connect to QR Studio."); }
  }
  async function loadCodes() {
    setLoadingCodes(true);
    try { const data = await api<{ codes: QRCodeRecord[] }>("/api/codes"); setCodes(data.codes); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load QR codes."); }
    finally { setLoadingCodes(false); }
  }
  useEffect(() => { const configuredOrigin = process.env.NEXT_PUBLIC_QR_SCAN_ORIGIN; try { const scanOrigin = new URL(configuredOrigin || window.location.origin); setOrigin(["https:", "http:"].includes(scanOrigin.protocol) ? scanOrigin.origin : window.location.origin); } catch { setOrigin(window.location.origin); } void refreshSession(); }, []);
  useEffect(() => { if (session?.user) void loadCodes(); }, [session?.user?.id]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 4500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => {
    if (view !== "analytics" || !session?.user) return;
    let current = true; setAnalyticsLoading(true); setAnalyticsError("");
    api<Analytics>(`/api/analytics?days=${days}${eventFilter ? `&event=${encodeURIComponent(eventFilter)}` : ""}${filterCode ? `&codeId=${encodeURIComponent(filterCode)}` : ""}`).then(data => { if (current) setAnalytics(data); }).catch(e => { if (current) setAnalyticsError(e.message); }).finally(() => { if (current) setAnalyticsLoading(false); });
    return () => { current = false; };
  }, [view, days, filterCode, eventFilter, session?.user?.id, codes]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [hasUnsavedChanges]);
  useEffect(() => {
    if (!deleteTarget) return;
    const previous = document.activeElement as HTMLElement | null;
    deleteDialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, [deleteTarget]);
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const update = () => document.documentElement.style.setProperty("--studio-nav-height", `${sidebar.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, [session?.user?.id]);
  function showMobilePane(next: "edit" | "preview") {
    setMobilePane(next);
    requestAnimationFrame(() => {
      if (!window.matchMedia("(max-width: 760px)").matches || !mobileSwitcher.current) return;
      const navHeight = sidebarRef.current?.getBoundingClientRect().height || 0;
      const offset = mobileSwitcher.current.getBoundingClientRect().top - navHeight;
      if (Math.abs(offset) > 2) window.scrollBy({ top: offset, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
  }
  function canDiscard() { return !hasUnsavedChanges || window.confirm("Discard your unsaved QR code changes?"); }
  function change<K extends keyof QRCodeInput>(key: K, value: QRCodeInput[K]) { setForm(old => ({ ...old, [key]: value })); }
  function design<K extends keyof QRDesign>(key: K, value: QRDesign[K]) { setForm(old => ({ ...old, design: { ...old.design, [key]: value } })); }
  function utm(key: keyof QRCodeInput["utm"], value: string | boolean) { setForm(old => ({ ...old, utm: { ...old.utm, [key]: value } })); }
  function navigate(next: View) { if (view === "create" && next !== "create" && hasUnsavedChanges) { if (!canDiscard()) return; setForm(savedInput); } setView(next); setError(""); if (next === "library") void loadCodes(); }
  function newCode() { if (!canDiscard()) return; const fresh = initialForm(); setForm(fresh); setSavedInput(fresh); setEditing(null); setTab("content"); setMobilePane("edit"); setView("create"); setError(""); }
  function editCode(code: QRCodeRecord) {
    if (!canDiscard()) return;
    const input: QRCodeInput = { name: code.name, destination: code.destination, event: code.event, book: code.book, placement: code.placement, status: code.status, expiresAt: code.expiresAt, design: { ...code.design }, utm: { ...code.utm } };
    setEditing(code); setForm(input); setSavedInput(input); setTab("content"); setMobilePane("edit"); setView("create"); setError("");
  }
  function duplicateCode(code: QRCodeRecord) {
    if (!canDiscard()) return;
    const { id: _id, slug: _slug, createdAt: _created, updatedAt: _updated, scans: _scans, ...input } = code;
    setEditing(null); setForm({ ...input, name: `${code.name} — copy`, status: "active", expiresAt: null }); setSavedInput(initialForm()); setTab("content"); setMobilePane("edit"); setView("create"); setError(""); setToast("Copy ready. Save it to create a new tracking link.");
  }

  async function saveCode(): Promise<QRCodeRecord> {
    if (!form.name.trim()) throw new Error("Give this QR code a name before saving.");
    let url: URL; try { url = new URL(form.destination); } catch { throw new Error("Enter a complete destination URL, starting with https://."); }
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("Use an https:// or http:// destination URL.");
    if (warnings.length) throw new Error(warnings[0]);
    const result = await api<{ code: QRCodeRecord }>(editing ? `/api/codes/${editing.id}` : "/api/codes", { method: editing ? "PATCH" : "POST", body: JSON.stringify({ ...form, name: form.name.trim(), utm: { ...form.utm, campaign: form.utm.campaign || campaignLabel(form.event), content: form.utm.content || campaignLabel(form.placement) } }) });
    setEditing(result.code); const { id: _id, slug: _slug, createdAt: _created, updatedAt: _updated, scans: _scans, ...input } = result.code; setForm(input); setSavedInput(input); setCodes(old => [result.code, ...old.filter(c => c.id !== result.code.id)]); return result.code;
  }
  async function saveChanges() {
    setBusy(true); setError("");
    try { await saveCode(); setToast("QR code saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save your QR code."); }
    finally { setBusy(false); }
  }

  async function exportSaved(code: QRCodeRecord, format: ExportFormat = "png") {
    setBusy(true); setError(""); try { await exportQR(`${origin}/q/${code.slug}`, code.design, { format, size: Number(exportSize), name: code.name }); setToast(`${format.toUpperCase()} downloaded.`); } catch (e) { setError(e instanceof Error ? e.message : "Download failed."); } finally { setBusy(false); }
  }
  async function copyLink(code: QRCodeRecord) { try { await navigator.clipboard.writeText(`${origin}/q/${code.slug}`); setToast("Tracking link copied."); } catch { setError("Clipboard access was blocked. Open the code editor and select its tracking link to copy it."); } }
  async function toggleStatus(code: QRCodeRecord) { setBusy(true); setError(""); try { const { code: updated } = await api<{ code: QRCodeRecord }>(`/api/codes/${code.id}`, { method: "PATCH", body: JSON.stringify({ status: code.status === "active" ? "paused" : "active" }) }); setCodes(old => old.map(c => c.id === code.id ? updated : c)); setToast(updated.status === "active" ? "QR code is active." : "QR code paused. Its link will show an unavailable message."); } catch (e) { setError(e instanceof Error ? e.message : "Could not update the code."); } finally { setBusy(false); } }
  async function removeCode() { if (!deleteTarget) return; setBusy(true); try { await api(`/api/codes/${deleteTarget.id}`, { method: "DELETE" }); setCodes(old => old.filter(c => c.id !== deleteTarget.id)); if (editing?.id === deleteTarget.id) { setEditing(null); setForm(initialForm()); setSavedInput(initialForm()); } setDeleteTarget(null); setToast("QR code deleted."); } catch (e) { setError(e instanceof Error ? e.message : "Could not delete the code."); } finally { setBusy(false); } }
  async function signOut() {
    if (!canDiscard()) return;
    setBusy(true); setError("");
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); setCodes([]); setSession(old => old ? { ...old, user: null } : old); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not sign out. Please try again."); }
    finally { setBusy(false); }
  }
  async function createBulk() {
    const rows = bulk.split("\n").filter(row => row.trim()).map(row => row.split("|").map(cell => cell.trim()));
    if (!rows.length || rows.length > 25 || rows.some(row => !row[0] || row.length > 3)) { setBulkResult("Add 1–25 rows in this format: name | event | placement."); return; }
    if (warnings.length) { setBulkResult(warnings[0]); return; }
    setBusy(true); setBulkResult(""); let succeeded = 0; const failed: string[] = [];
    for (const row of rows) { try { await api("/api/codes", { method: "POST", body: JSON.stringify({ ...form, name: row[0], event: row[1] || form.event, placement: row[2] || form.placement, status: "active", utm: { ...form.utm, campaign: form.utm.campaign || campaignLabel(row[1] || form.event), content: form.utm.content || campaignLabel(row[2] || form.placement) } }) }); succeeded++; } catch (e) { failed.push(`${row.join(" | ")}`); setBulkResult(e instanceof Error ? e.message : "Some rows could not be saved."); } }
    setBulk(failed.join("\n")); setBulkResult(`${succeeded} code${succeeded === 1 ? "" : "s"} created.${failed.length ? ` ${failed.length} could not be saved; those rows are still here to retry.` : " Each has its own tracking link."}`); await loadCodes(); setBusy(false);
  }
  const codeLink = editing ? `${origin}/q/${editing.slug}` : form.destination;
  const visibleCodes = codes.filter(code => (statusFilter === "all" || code.status === statusFilter) && `${code.name} ${code.event} ${code.book} ${code.placement}`.toLowerCase().includes(search.toLowerCase()));

  if (!session) return <div className="auth-layout"><div className="auth-card"><img src="/mastra-logo.svg" alt="Mastra" width="130" /><h1>QR Studio</h1><p role="status">{sessionError || "Getting your studio ready…"}</p>{sessionError && <button className="btn primary" onClick={() => void refreshSession()}>Try again</button>}</div></div>;
  if (!session.user) return <Auth session={session} onSignedIn={refreshSession} />;

  return <div className="app-shell">
    <aside className="sidebar" ref={sidebarRef}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); newCode(); }} aria-label="Mastra QR Studio home"><img src="/mastra-logo.svg" alt="Mastra" width="124" /><span>QR STUDIO</span></a>
      <div className="workspace-label">YOUR WORKSPACE <span>2027</span></div>
      <nav aria-label="Main navigation">
        {[{ id: "create", label: "Create a QR code", icon: "plus" }, { id: "library", label: "Your QR codes", icon: "qr" }, { id: "analytics", label: "Scan analytics", icon: "chart" }].map(item => <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => navigate(item.id as View)}><Icon name={item.icon} /><span>{item.label}</span>{item.id === "library" && <small>{codes.length}</small>}</button>)}
      </nav>
      <div className="sidebar-bottom"><button className={`nav-item ${view === "guide" ? "active" : ""}`} onClick={() => navigate("guide")}><Icon name="book" /><span>How it works</span><Icon name="chevron" size={14} /></button><div className="sidebar-user"><span className="avatar">M</span><div><strong>Mastra workspace</strong><small>{session.mode === "local" ? "Local preview" : session.user.email}</small></div>{session.mode !== "local" && <button aria-label="Sign out" title="Sign out" className="button-link" disabled={busy} onClick={() => void signOut()}><Icon name="logout" size={17} /></button>}</div></div>
    </aside>
    <div className="main-wrap"><header className="topbar"><div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={13} /><strong>{{ create: "Create a QR code", library: "Your QR codes", analytics: "Scan analytics", guide: "How it works" }[view]}</strong></div><div className="topbar-status"><span className="status-dot" /> {session.mode === "local" ? "Local preview" : "Your private studio"}<button className="topbar-help" aria-label="How tracking works" onClick={() => navigate("guide")}><Icon name="book" size={15} /></button>{session.mode !== "local" && <button className="mobile-signout" aria-label="Sign out" disabled={busy} onClick={() => void signOut()}><Icon name="logout" size={15} /></button>}<span className="avatar">M</span></div></header>
    <main className="main">
      {error && <div className="alert" role="alert">{error}<button className="button-link" aria-label="Dismiss error" onClick={() => setError("")}><Icon name="close" size={16} /></button></div>}
      {view === "create" && <>
        <div className="page-heading"><div><h1>{editing ? "Edit QR code" : "Create a QR code"}</h1><p>Customize a code for your book, event, or campaign.</p></div>{editing && <button className="btn secondary" onClick={newCode}><Icon name="plus" size={16} />New code</button>}</div>
        <div className="mobile-editor-switch" ref={mobileSwitcher} role="group" aria-label="Editor view">
          <button type="button" aria-pressed={mobilePane === "edit"} aria-controls="editor-details-pane" className={mobilePane === "edit" ? "active" : ""} onClick={() => showMobilePane("edit")}><Icon name="edit" size={16} />Edit</button>
          <button type="button" aria-pressed={mobilePane === "preview"} aria-controls="editor-preview-pane" className={mobilePane === "preview" ? "active" : ""} onClick={() => showMobilePane("preview")}><Icon name="qr" size={16} />Preview</button>
        </div>
        <div className={`editor-layout mobile-pane-${mobilePane}`}><section className="editor-panel" id="editor-details-pane" aria-label="QR code editor">
          <div className="editor-tabs" role="tablist" aria-label="QR code settings">{(["content", "design", "tracking"] as Tab[]).map((item, i) => <button key={item} role="tab" id={`tab-${item}`} aria-selected={tab === item} aria-controls={`panel-${item}`} className={tab === item ? "active" : ""} onClick={() => setTab(item)} tabIndex={tab === item ? 0 : -1} onKeyDown={event => { const tabs: Tab[] = ["content", "design", "tracking"]; const next = event.key === "ArrowRight" ? tabs[(i + 1) % 3] : event.key === "ArrowLeft" ? tabs[(i + 2) % 3] : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[2] : null; if (next) { event.preventDefault(); setTab(next); document.getElementById(`tab-${next}`)?.focus(); } }}>{item[0].toUpperCase() + item.slice(1)}{tab === item && <span className="tab-line" />}</button>)}</div>
          <div className="editor-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "content" && <>
            <div className="section-title"><span className="icon-box"><Icon name="link" /></span><div><h2>Destination and details</h2><p>Choose the link people open when they scan.</p></div></div>
            <Field label="Destination URL" hint="The page a scan opens. You can update it later without reprinting."><div className="input-icon"><Icon name="link" size={17} /><input type="url" required value={form.destination} onChange={e => change("destination", e.target.value)} placeholder="https://www.mastrabooks.dev" autoComplete="url" /></div></Field>
            <Field label="QR code name" hint="A name that makes this code easy to find later."><input required value={form.name} onChange={e => change("name", e.target.value)} placeholder="e.g. AI Engineer Summit · book table" maxLength={120} /></Field>
            <div className="divider" /><div className="section-caption"><span>MAKE IT EASY TO ORGANIZE</span><span>Optional</span></div>
            <div className="field-grid"><Field label="Event or campaign"><input value={form.event} onChange={e => change("event", e.target.value)} placeholder="e.g. AI Engineer Summit 2027" maxLength={120} /></Field><Field label="Placement"><input value={form.placement} onChange={e => change("placement", e.target.value)} placeholder="e.g. Booth, book insert, slide" maxLength={120} /></Field></div>
            <Field label="Book label" hint="For your reports only. Does not change the book selected on the fulfillment site."><select value={form.book} onChange={e => change("book", e.target.value)}>{books.map(book => <option key={book}>{book}</option>)}</select></Field>

            <div className="form-actions"><button className="btn secondary" onClick={() => setTab("design")}>Customize design <Icon name="arrow" size={16} /></button></div>
          </>}
          {tab === "design" && <>
            <div className="section-title"><span className="icon-box"><Icon name="palette" /></span><div><h2>Customize the design</h2><p>Start with a preset, then add your logo.</p></div></div>
            <fieldset className="preset-choices"><legend>Style presets</legend><div className="preset-row">{DESIGN_PRESETS.map(preset => <button key={preset.id} aria-label={preset.name} title={preset.description} aria-pressed={JSON.stringify(form.design) === JSON.stringify(preset.design)} className={`preset-mini ${JSON.stringify(form.design) === JSON.stringify(preset.design) ? "selected" : ""}`} onClick={() => change("design", { ...preset.design })}><span style={{ background: preset.design.background }}><QRPreview value="https://www.mastrabooks.dev" design={preset.design} size={48} /></span>{preset.name}</button>)}</div></fieldset>
            <div className="divider" /><Field label="Center logo"><div className="segmented">{([{ id: "mastra", text: "Mastra" }, { id: "none", text: "No logo" }, { id: "upload", text: "Your logo" }] as const).map(item => <button key={item.id} aria-pressed={form.design.logo === item.id} className={form.design.logo === item.id ? "active" : ""} onClick={() => design("logo", item.id)}>{item.text}</button>)}</div></Field>
            {form.design.logo === "upload" && <Field label="Upload your logo" hint="PNG, JPG, or WebP · up to 2 MB"><input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); setError(""); try { const data = await normalizeLogo(file); design("logoData", data); setToast("Logo added."); } catch (err) { setError(err instanceof Error ? err.message : "Could not read the logo."); } finally { setBusy(false); } }} />{form.design.logoData && <img src={form.design.logoData} alt="Uploaded logo" width="48" height="48" style={{ objectFit: "contain" }} />}</Field>}
            <Field label="Code color"><div className="color-field"><input type="color" aria-label="Code color" value={form.design.foreground} onChange={e => design("foreground", e.target.value)} /><span>{form.design.foreground.toUpperCase()}</span></div></Field>
            <details className="advanced-settings"><summary>Advanced design<Icon name="chevron" size={16} /></summary><div className="advanced-body">
            {form.design.logo !== "none" && <Field label={`Logo size · ${Math.round(form.design.logoSize * 100)}%`} hint="Kept small to protect scan reliability."><input type="range" min="12" max="22" value={Math.round(form.design.logoSize * 100)} onChange={e => design("logoSize", Number(e.target.value) / 100)} /></Field>}
            <div className="field-grid">{([{ key: "background", label: "Background" }, { key: "eyeColor", label: "Corner color" }] as const).map(item => <Field key={item.key} label={item.label}><div className="color-field"><input type="color" aria-label={item.label} value={form.design[item.key]} onChange={e => design(item.key, e.target.value)} /><span>{form.design[item.key].toUpperCase()}</span></div></Field>)}<Field label="Color style"><select value={form.design.gradient} onChange={e => design("gradient", e.target.value as QRDesign["gradient"])}><option value="none">Solid color</option><option value="linear">Linear gradient</option><option value="radial">Radial gradient</option></select></Field></div>
            {form.design.gradient !== "none" && <div className="field-grid"><Field label="Gradient end color"><div className="color-field"><input type="color" value={form.design.gradientColor} onChange={e => design("gradientColor", e.target.value)} /><span>{form.design.gradientColor.toUpperCase()}</span></div></Field><Field label={`Gradient angle · ${form.design.gradientRotation}°`}><input type="range" min="0" max="360" value={form.design.gradientRotation} onChange={e => design("gradientRotation", Number(e.target.value))} /></Field></div>}
            <Field label="Dot style"><div className="segmented dot-options">{(["square", "rounded", "dots", "classy"] as const).map(shape => <button key={shape} aria-pressed={form.design.dots === shape} className={form.design.dots === shape ? "active" : ""} onClick={() => design("dots", shape)}><span className={`pattern ${shape}`} aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</span>{shape[0].toUpperCase() + shape.slice(1)}</button>)}</div></Field>
            <div className="field-grid"><Field label="Corner frame"><select value={form.design.corners} onChange={e => design("corners", e.target.value as QRDesign["corners"])}><option value="rounded">Rounded</option><option value="square">Square</option><option value="dot">Circle</option></select></Field><Field label="Corner center"><select value={form.design.eyes} onChange={e => design("eyes", e.target.value as QRDesign["eyes"])}><option value="square">Square</option><option value="rounded">Rounded</option><option value="dot">Circle</option></select></Field></div>
            <div className="field-grid"><Field label="Print frame"><select value={form.design.frame} onChange={e => design("frame", e.target.value as QRDesign["frame"])}><option value="none">No frame</option><option value="bottom">Outline with caption</option><option value="banner">Filled frame with caption</option></select></Field>{form.design.frame !== "none" && <Field label="Frame color"><div className="color-field"><input type="color" value={form.design.frameColor} onChange={e => design("frameColor", e.target.value)} /><span>{form.design.frameColor.toUpperCase()}</span></div></Field>}</div>
            {form.design.frame !== "none" && <Field label="Frame caption"><input value={form.design.caption} onChange={e => design("caption", e.target.value)} maxLength={80} /></Field>}
            </div></details>
            <div className="form-actions"><button className="btn secondary" onClick={() => setTab("tracking")}>Set up tracking <Icon name="arrow" size={16} /></button></div>
          </>}
          {tab === "tracking" && <>
            <div className="section-title"><span className="icon-box"><Icon name="chart" /></span><div><h2>Tracking settings</h2><p>Assign campaign tags and manage availability.</p></div></div>
            <div className="toggle-row"><div><strong>Campaign parameters</strong><p>Pass attribution to your fulfillment site's analytics.</p></div><button className={`toggle ${form.utm.enabled ? "on" : ""}`} role="switch" aria-checked={form.utm.enabled} aria-label="Campaign parameters" onClick={() => utm("enabled", !form.utm.enabled)}><span /></button></div>
            {form.utm.enabled && <details className="advanced-settings"><summary>Customize campaign tags<Icon name="chevron" size={16} /></summary><div className="advanced-body"><p className="field-help">Campaign and content default to your event and placement.</p><div className="field-grid"><Field label="Source"><input value={form.utm.source} maxLength={160} onChange={e => utm("source", e.target.value)} placeholder="event" /></Field><Field label="Medium"><input value={form.utm.medium} maxLength={160} onChange={e => utm("medium", e.target.value)} placeholder="qr" /></Field><Field label="Campaign"><input value={form.utm.campaign} maxLength={160} onChange={e => utm("campaign", e.target.value)} placeholder={campaignLabel(form.event) || "ai-engineer-2027"} /></Field><Field label="Content"><input value={form.utm.content} maxLength={160} onChange={e => utm("content", e.target.value)} placeholder={campaignLabel(form.placement) || "book-table"} /></Field></div></div></details>}
            <div className="divider" /><div className="field-grid"><Field label="Code status"><select value={form.status} onChange={e => change("status", e.target.value as QRCodeInput["status"])}><option value="active">Active</option><option value="paused">Paused</option></select></Field><Field label="Expiration date" hint="Optional. Expires at the end of this date, UTC."><input type="date" value={form.expiresAt?.slice(0, 10) || ""} onChange={e => change("expiresAt", e.target.value ? `${e.target.value}T23:59:59.999Z` : null)} /></Field></div>
            <div className="soft-callout"><Icon name="pin" /><div><strong>Location is approximate. Attribution is yours.</strong><p>Scans record time, device type, and approximate city/country when available. We don’t store IP addresses or request GPS. Use a different code per event for dependable event attribution.</p></div></div>
            <p className="field-help">Counts include visits to the tracking link. They aren't unique people or confirmed book orders. Campaign parameters need analytics on the destination site to report fulfillment conversions.</p>
            <button className="button-link" onClick={() => setBulkOpen(!bulkOpen)}><Icon name="plus" size={16} />{bulkOpen ? "Close bulk creation" : "Create multiple codes with this design"}</button>
            {bulkOpen && <div className="bulk-panel"><Field label="One code per line" hint="name | event | placement · up to 25 codes. Uses this destination, book and design. Empty campaign/content tags follow each row’s event/placement."><textarea rows={5} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={"SF book table | AI Engineer 2027 | Booth\nNYC book insert | NYC meetup | Book insert"} /></Field><button className="btn secondary" disabled={busy} onClick={() => void createBulk()}>{busy ? "Creating…" : "Create codes"}</button>{bulkResult && <p role="status">{bulkResult}</p>}</div>}
          </>}
          </div>
        </section>
        <aside className="preview-column" id="editor-preview-pane"><section className="preview-panel"><div className="preview-label"><span>LIVE PREVIEW</span><span className="status-pill">{editing ? hasUnsavedChanges ? "Unsaved changes" : "Saved QR code" : "Draft"}</span></div><div className="qr-stage"><QRPreview value={codeLink || "https://www.mastrabooks.dev"} design={form.design} size={254} /></div><div className="preview-meta"><h3>{form.name || "Untitled QR code"}</h3><p>{form.book}</p></div>{editing && <div className="preview-link"><input readOnly aria-label="Tracking link" value={`${origin}/q/${editing.slug}`} onFocus={e => e.target.select()} /><button className="button-link" title="Copy tracking link" aria-label="Copy tracking link" onClick={() => void copyLink(editing)}><Icon name="copy" size={16} /></button></div>}{warnings.map(message => <p className="alert" role="alert" key={message}>{message}</p>)}<div className="preview-warning"><Icon name="shield" size={16} /><div><strong>Preview only — don’t print for events</strong><p>{session.mode === "local" ? "These codes open on this computer. Publish to a stable address before sharing." : "Scans require preview access. Public event scanning is not enabled yet."}</p></div></div><button className="btn primary full" disabled={busy} onClick={() => readyToDownload && editing ? void exportSaved(editing, "png") : void saveChanges()}><Icon name={readyToDownload ? "download" : "qr"} size={18} />{busy ? readyToDownload ? "Downloading…" : "Saving…" : readyToDownload ? "Download PNG" : editing ? "Save changes" : "Save QR code"}{!readyToDownload && <Icon name="arrow" size={17} />}</button><div className="download-row">{(["svg", "pdf"] as ExportFormat[]).map(format => <button key={format} className="btn secondary" disabled={busy || !editing || hasUnsavedChanges} title={!editing ? "Save the code before downloading" : hasUnsavedChanges ? "Save your changes before downloading" : `Download saved ${format.toUpperCase()}`} onClick={() => editing && !hasUnsavedChanges && void exportSaved(editing, format)}><Icon name="download" size={14} />{format.toUpperCase()}</button>)}</div><div className="export-origin"><span>Scan domain</span><code>{origin.replace(/^https?:\/\//, "") || "Loading…"}</code></div><label className="export-size">Export size <select value={exportSize} onChange={e => setExportSize(e.target.value)}><option value="1024">1,024 px</option><option value="2048">2,048 px</option><option value="4096">4,096 px</option></select></label><p className="preview-tip">{!editing ? "Save this code to enable downloads." : hasUnsavedChanges ? "Save your changes before downloading." : "Downloads use your saved design and tracking link."}</p></section></aside></div>
      </>}
      {view === "library" && <>
        <div className="page-heading"><div><h1>Your QR codes</h1><p>Manage destinations, campaigns, and scan activity.</p></div><button className="btn primary" onClick={newCode}><Icon name="plus" size={17} />Create QR code</button></div>
        <div className="library-toolbar"><div className="input-icon"><Icon name="search" size={18} /><input aria-label="Search QR codes" placeholder="Search by name, event, or book…" value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Filter QR code status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option></select><button className="btn secondary" disabled={!visibleCodes.length} onClick={() => downloadCSV("mastra-qr-codes.csv", [["Name", "Event", "Book", "Placement", "Status", "Scans", "Tracking link", "Destination"], ...visibleCodes.map(c => [c.name, c.event, c.book, c.placement, c.status, c.scans, `${origin}/q/${c.slug}`, c.destination])])}><Icon name="download" size={16} />Export CSV</button></div>
        {loadingCodes ? <div className="empty-state" role="status">Loading your QR codes…</div> : !visibleCodes.length ? <div className="empty-state"><span className="icon-box"><Icon name="qr" size={30} /></span><h2>{codes.length ? "No matching codes." : "No QR codes yet."}</h2><p>{codes.length ? "Try another search or status filter." : "Create your first QR code. Give it a book, an event, and a destination."}</p><button className="btn primary" onClick={codes.length ? () => { setSearch(""); setStatusFilter("all"); } : newCode}>{codes.length ? "Clear filters" : "Create your first code"}<Icon name="arrow" size={16} /></button></div> : <div className="library-table"><div className="table-head"><span>QR CODE</span><span>CAMPAIGN</span><span>SCANS</span><span>STATUS & ACTIONS</span></div>{visibleCodes.map(code => <div className="code-row" key={code.id}><div className="code-main"><QRPreview value={`${origin}/q/${code.slug}`} design={code.design} size={62} /><div><button className="button-link" onClick={() => editCode(code)}><strong>{code.name}</strong></button><small>{code.book}</small><small>Created {fmtDate(code.createdAt)}</small></div></div><div className="code-campaign"><strong>{code.event || "No event"}</strong><small>{code.placement || "No placement"}</small></div><strong className="scan-count">{code.scans.toLocaleString()}</strong><div className="row-actions"><span className={`status-pill ${code.status}`}>{code.expiresAt && new Date(code.expiresAt).getTime() < Date.now() ? "Expired" : code.status}</span><div><button className="button-link" aria-label={`Edit ${code.name}`} title="Edit" onClick={() => editCode(code)}><Icon name="edit" size={16} /></button><button className="button-link" aria-label={`Copy link for ${code.name}`} title="Copy link" onClick={() => void copyLink(code)}><Icon name="copy" size={16} /></button><button className="button-link" disabled={busy} aria-label={`Download ${code.name} as PNG`} title="Download PNG" onClick={() => void exportSaved(code)}><Icon name="download" size={16} /></button><select aria-label={`More actions for ${code.name}`} value="" disabled={busy} onChange={e => { if (e.target.value === "duplicate") duplicateCode(code); if (e.target.value === "pause") void toggleStatus(code); if (e.target.value === "analytics") { setEventFilter(code.event); setFilterCode(code.id); navigate("analytics"); } if (e.target.value === "delete") setDeleteTarget(code); }}><option value="">More</option><option value="duplicate">Duplicate</option><option value="pause">{code.status === "active" ? "Pause" : "Activate"}</option><option value="analytics">View analytics</option><option value="delete">Delete</option></select></div></div></div>)}</div>}
      </>}
      {view === "analytics" && <>
        <div className="page-heading"><div><h1>Scan analytics</h1><p>Compare events and books, then explore when and where visits happen.</p></div><div className="heading-actions"><select aria-label="Filter analytics by event" value={eventFilter} onChange={e => { setEventFilter(e.target.value); setFilterCode(""); }}><option value="">All events</option>{[...new Set(codes.map(c => c.event).filter(Boolean))].sort().map(event => <option key={event}>{event}</option>)}</select><select aria-label="Analytics period" value={days} onChange={e => setDays(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 365 days</option></select><select aria-label="Filter analytics by QR code" value={filterCode} onChange={e => setFilterCode(e.target.value)}><option value="">All QR codes</option>{codes.filter(code => !eventFilter || code.event === eventFilter).map(code => <option key={code.id} value={code.id}>{code.name}</option>)}</select></div></div>
        {analyticsError && <div className="alert" role="alert">{analyticsError}</div>}{analyticsLoading ? <div className="empty-state" role="status">Gathering your scans…</div> : analytics && <>
          <div className="stats-grid">{[{ label: "Total scans", value: analytics.totalScans, icon: "qr", note: "Visits to your tracking links" }, { label: "Active QR codes", value: analytics.activeCodes, icon: "link", note: "Available tracking links" }, { label: "Countries reached", value: analytics.countries, icon: "globe", note: "Approximate visitor location" }].map(stat => <div className="stat-card" key={stat.label}><div><span>{stat.label}</span><Icon name={stat.icon} size={19} /></div><strong>{stat.value.toLocaleString()}</strong><small>{stat.note}</small></div>)}</div>
          <section className="chart-card"><div className="card-heading"><div><h2>Scans over time</h2><p>Daily visits to your tracking links.</p></div><span className="status-pill">Daily · UTC</span></div><ScanChart days={analytics.byDay} /><div className="chart-labels"><span>{analytics.byDay[0]?.date}</span><span>{analytics.byDay.at(-1)?.date}</span></div><details className="daily-counts"><summary>View daily counts</summary><div className="recent-table"><table><thead><tr><th>Date (UTC)</th><th>Scans</th></tr></thead><tbody>{analytics.byDay.map(day => <tr key={day.date}><td>{day.date}</td><td>{day.scans.toLocaleString()}</td></tr>)}</tbody></table></div></details></section>
          <div className="guide-grid campaign-breakdown"><Breakdown title="Scans by event" rows={analytics.byEvent} /><Breakdown title="Scans by book" rows={analytics.byBook} /><Breakdown title="Scans by code" rows={analytics.byCode.map(c => ({name:c.name,scans:c.scans}))} /></div>
          <div className="secondary-analytics" data-selected={mobileBreakdown}>
            <label className="breakdown-selector" htmlFor="scan-breakdown-select">Break down scans by<select id="scan-breakdown-select" aria-controls="scan-breakdowns" value={mobileBreakdown} onChange={e => setMobileBreakdown(e.target.value as typeof mobileBreakdown)}><option value="country">Country</option><option value="city">City</option><option value="device">Device</option></select></label>
            <div className="guide-grid" id="scan-breakdowns">
              <div data-breakdown="country"><Breakdown title="Top countries" rows={analytics.byCountry} /></div>
              <div data-breakdown="city"><Breakdown title="Top cities" rows={analytics.byCity} /></div>
              <div data-breakdown="device"><Breakdown title="Devices" rows={analytics.byDevice} /></div>
            </div>
          </div>
          <section className="chart-card"><div className="card-heading"><div><h2>Recent scans</h2><p>Latest recorded visits. Location may be unavailable.</p></div><button className="btn secondary" disabled={!analytics.recent.length} onClick={() => downloadCSV("mastra-recent-scans.csv", [["Timestamp", "QR code", "Country", "Region", "City", "Device"], ...analytics.recent.map(s => [s.scannedAt, s.codeName, s.country, s.region, s.city, s.device])])}><Icon name="download" size={16} />Export recent</button></div>{analytics.recent.length ? <div className="recent-table"><table><thead><tr><th>QR code</th><th>When</th><th>Location</th><th>Device</th></tr></thead><tbody>{analytics.recent.map(scan => <tr key={scan.id}><td>{scan.codeName}</td><td>{new Date(scan.scannedAt).toLocaleString()}</td><td>{[scan.city, scan.country].filter(v => v && v !== "Unknown").join(", ") || "Unknown"}</td><td>{scan.device}</td></tr>)}</tbody></table></div> : <div className="empty-state compact"><Icon name="qr" size={28} /><h3>No scans yet</h3><p>Once a saved QR code is opened, real activity will appear here.</p></div>}</section><p className="field-help">Scans are link visits, not unique people or fulfilled orders. Automated requests may be included. Locations are approximate; VPNs and mobile networks can affect them.</p>
        </>}
      </>}
      {view === "guide" && <><div className="page-heading"><div><h1>How QR tracking works</h1><p>Create, test, and manage your event codes.</p></div></div><div className="guide-grid">{[{ icon: "qr", title: "1. Create a code per event", text: "Use a separate code for each event, book, or placement. The event label tells you which campaign drove the visit, even if someone scans after returning home." }, { icon: "palette", title: "2. Customize and test", text: "Choose colors, a logo, and a frame. Download an SVG for sharp print artwork, or PNG/PDF to share. Test the final printed size on more than one phone before producing a full batch." }, { icon: "chart", title: "3. Review scan activity", text: "A saved code opens a stable tracking link, records a visit, and redirects to your destination. Change the destination later without changing the printed code." }].map(item => <article className="guide-card" key={item.title}><span className="icon-box"><Icon name={item.icon} size={25} /></span><h2>{item.title}</h2><p>{item.text}</p></article>)}</div><div className="chart-card guide-copy"><h2>What location tracking can tell you</h2><p>Available network information gives an approximate country, region, and city. It isn't GPS and cannot prove a person scanned at a specific booth. No raw IP address is stored. Use a unique event code for reliable campaign attribution.</p><h2>Before your first event</h2><p>This studio must be hosted at a stable, publicly accessible address so guests can open QR links. A private preview requires access and isn't ready for anonymous event visitors. Test a saved code from a signed-out phone on mobile data before printing.</p><h2>What about codes you've already printed?</h2><p>A static QR code always contains the same URL. You can only add tracking to an existing print if you control that URL and can update its behavior. New dynamic codes created here use their own permanent tracking links.</p><h2>Scans and book orders are different</h2><p>Scan counts measure visits to the tracking link. A shared link, a repeat visitor, or an automated preview can add a visit. UTM parameters carry campaign context into the book fulfillment site; confirmed book orders need that site's own analytics or integration.</p></div></>}
      <footer className="footer"><span>Mastra books and events</span><span>MASTRA QR STUDIO <span>·</span> 2027</span></footer>
    </main></div>
    {toast && <div className="toast" role="status"><Icon name="check" size={18} />{toast}<button className="button-link" aria-label="Dismiss notification" onClick={() => setToast("")}><Icon name="close" size={16} /></button></div>}
    {deleteTarget && <div className="modal-overlay" onClick={() => !busy && setDeleteTarget(null)}><div className="modal" ref={deleteDialog} onKeyDown={event => { if (event.key === "Escape" && !busy) setDeleteTarget(null); if (event.key === "Tab") { const buttons = deleteDialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"); if (buttons?.length) { const first = buttons[0]; const last = buttons[buttons.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } } }} role="alertdialog" aria-modal="true" aria-labelledby="delete-heading" onClick={e => e.stopPropagation()}><h2 id="delete-heading">Delete this QR code?</h2><p>“{deleteTarget.name}” and its scan history will be deleted. Printed copies of this code will stop opening the destination.</p><div className="form-actions"><button className="btn secondary" disabled={busy} onClick={() => setDeleteTarget(null)}>Keep code</button><button className="btn danger" disabled={busy} onClick={() => void removeCode()}>{busy ? "Deleting…" : "Delete code"}</button></div></div></div>}
  </div>;
}

function ScanChart({ days }: { days: Analytics["byDay"] }) {
  const max = Math.max(4, ...days.map(d => d.scans)); const width = 900; const height = 180; const left = 40;
  const points = days.map((d, i) => `${left + (days.length > 1 ? i * (width-left) / (days.length - 1) : (width-left) / 2)},${height - d.scans / max * (height - 12)}`).join(" ");
  return <div className="scan-chart"><svg viewBox={`0 0 ${width} ${height + 12}`} role="img" aria-label={`Daily scan activity: ${days.reduce((sum, d) => sum + d.scans, 0)} total visits. Exact daily counts are in the expandable table below.`}><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7aff78" stopOpacity=".22" /><stop offset="100%" stopColor="#7aff78" stopOpacity="0" /></linearGradient></defs>{[0, 1, 2, 3, 4].map(i => <g key={i}><line x1={left} x2={width} y1={12 + i * (height - 12) / 4} y2={12 + i * (height - 12) / 4} stroke="#262626" strokeDasharray="4 5" /><text x="28" y={16 + i * (height - 12) / 4} fill="#939393" fontSize="11" textAnchor="end">{Math.round(max * (1-i/4))}</text></g>)}<polygon points={`${left},${height} ${points} ${width},${height}`} fill="url(#chart-fill)" /><polyline points={points} fill="none" stroke="#7aff78" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg>{days.every(d => !d.scans) && <div className="chart-empty"><strong>No scans in this period</strong><span>Visits will appear after a saved link is opened.</span></div>}</div>;
}
function Breakdown({ title, rows }: { title: string; rows: { name: string; scans: number }[] }) { const max = Math.max(1, ...rows.map(r => r.scans)); return <section className="breakdown"><h2>{title}</h2>{rows.length ? rows.slice(0, 6).map((row, index) => <div className="bar-row" key={`${row.name}-${index}`}><div><span>{row.name || "Unknown"}</span><strong>{row.scans.toLocaleString()}</strong></div><div className="bar-track"><div className="bar-fill" style={{ width: `${row.scans / max * 100}%` }} /></div></div>) : <p className="empty-copy">No scans in this period yet.</p>}</section>; }
function Auth({ session, onSignedIn }: { session: SessionInfo; onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "signup">("login"); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(""); setNotice(""); try { const result = await api<{ confirmationRequired?: boolean; message?: string }>(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) }); if (result.confirmationRequired) { setNotice(result.message || "Check your email to confirm your account, then sign in."); setMode("login"); } else await onSignedIn(); } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); } finally { setBusy(false); } }
  return <div className="auth-layout"><div className="auth-intro"><img src="/mastra-logo.svg" alt="Mastra" width="150" /><div className="eyebrow">QR STUDIO · 2027</div><h1>Mastra<br />QR Studio</h1><p>Create branded QR codes and track visits to your books and events.</p><div className="auth-qr"><QRPreview value="https://www.mastrabooks.dev" design={DESIGN_PRESETS[2].design} size={220} /></div></div><div className="auth-card"><div className="eyebrow">YOUR WORKSPACE</div><h2>{mode === "login" ? "Sign in" : "Create your account"}</h2><p>{mode === "login" ? "Access your QR code library and scan reports." : "Save and manage your QR codes in a private account."}</p>{!session.configured && <div className="alert">Your studio's account service is not connected yet. Connect it before signing in.</div>}<form onSubmit={e => void submit(e)}><Field label="Work email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@mastra.ai" /></Field><Field label="Password" hint={mode === "signup" ? "Use at least 12 characters." : undefined}><input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === "signup" ? 12 : 1} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></Field>{error && <p className="alert" role="alert">{error}</p>}{notice && <p className="soft-callout" role="status">{notice}</p>}<button type="submit" disabled={busy || !session.configured} className="btn primary full">{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}<Icon name="arrow" size={17} /></button></form><button className="button-link auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setNotice(""); }}>{mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button><p className="preview-tip"><Icon name="shield" size={15} /> Your codes and analytics belong to your account.</p></div></div>;
}
