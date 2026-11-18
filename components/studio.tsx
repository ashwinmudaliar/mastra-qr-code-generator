"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { QRPreview } from "./qr-preview";
import { CodesList, type CodeFilter } from "./codes-list";
import { Results, type ResultsFilters } from "./results";
import { StickerSheetDialog } from "./sticker-sheet-dialog";
import { Dialog, Field, Group, Icon, api, describedBy, formatDate, formatNumber, useMediaQuery } from "./ui";
import { DEFAULT_DESIGN, DESIGN_PRESETS, getDesignWarnings, type QRDesign } from "@/lib/qr-design";
import { exportQR, normalizeLogo, type ExportFormat } from "@/lib/qr-export";
import { draftLink, trackingLink } from "@/lib/tracking-link";
import type { QRCodeInput, QRCodeRecord, SessionInfo } from "@/lib/types";

type View = "codes" | "editor" | "results";
type FieldName = "destination" | "name";
type Toast = { message: string; action?: { label: string; run: () => void } };

const BOOKS = ["Both books", "Principles of Building AI Agents", "Patterns for Building AI Agents"];
const DOT_LABELS: Record<QRDesign["dots"], string> = { square: "Square", rounded: "Rounded", dots: "Dots", classy: "Classy" };
const initialForm = (): QRCodeInput => ({ name: "", destination: "https://www.mastrabooks.dev", event: "", book: "Both books", placement: "", status: "active", expiresAt: null, design: { ...DEFAULT_DESIGN }, utm: { enabled: true, source: "event", medium: "qr", campaign: "", content: "" } });
const editableInput = (code: QRCodeRecord): QRCodeInput => ({ name: code.name, destination: code.destination, event: code.event, book: code.book, placement: code.placement, status: code.status, expiresAt: code.expiresAt, design: { ...code.design }, utm: { ...code.utm } });
const isBooksHome = (value: string) => { try { const url = new URL(value); return ["mastrabooks.dev", "www.mastrabooks.dev"].includes(url.hostname) && url.pathname === "/"; } catch { return false; } };
const campaignLabel = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function styleSummary(design: QRDesign) {
  const frame = design.frame === "none" ? "no frame" : design.frame === "bottom" ? "outline frame" : "filled frame";
  const logo = design.logo === "none" ? "no logo" : `logo ${Math.round(design.logoSize * 100)}%`;
  return [`${DOT_LABELS[design.dots].toLowerCase()} dots`, `${design.corners === "dot" ? "circle" : design.corners} corners`, design.gradient === "none" ? "" : "gradient", frame, logo].filter(Boolean).join(" · ");
}

export default function Studio() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [view, setView] = useState<View>("codes");
  const [form, setForm] = useState<QRCodeInput>(initialForm);
  const [savedInput, setSavedInput] = useState<QRCodeInput>(initialForm);
  const [editing, setEditing] = useState<QRCodeRecord | null>(null);
  const [codes, setCodes] = useState<QRCodeRecord[]>([]);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [processingLogo, setProcessingLogo] = useState(false);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [saveError, setSaveError] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [search, setSearch] = useState("");
  const [codeFilter, setCodeFilter] = useState<CodeFilter>("current");
  const [filters, setFilters] = useState<ResultsFilters>({ days: "30", event: "", codeId: "" });
  const [historical, setHistorical] = useState<{ codeId: string; event: string }[]>([]);
  const [bulk, setBulk] = useState("");
  const [bulkResult, setBulkResult] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<QRCodeRecord | null>(null);
  const [stickerTarget, setStickerTarget] = useState<QRCodeRecord | null>(null);
  const [exportSize, setExportSize] = useState("2048");
  const [sheetOpen, setSheetOpen] = useState(false);
  const isPhone = useMediaQuery("(max-width: 760px)");
  const behindSheet = isPhone && sheetOpen && view === "editor";
  const codeFilterRef = useRef<HTMLSelectElement>(null);
  const sheetClose = useRef<HTMLButtonElement>(null);
  const warnings = getDesignWarnings(form.design);
  const hasUnsavedChanges = JSON.stringify(form) !== JSON.stringify(savedInput);
  const readyToDownload = Boolean(editing) && !hasUnsavedChanges;

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
  useEffect(() => {
    const configured = process.env.NEXT_PUBLIC_QR_SCAN_ORIGIN;
    try { const scanOrigin = new URL(configured || window.location.origin); setOrigin(["https:", "http:"].includes(scanOrigin.protocol) ? scanOrigin.origin : window.location.origin); }
    catch { setOrigin(window.location.origin); }
    void refreshSession();
  }, []);
  useEffect(() => { setHistorical([]); if (session?.user) void loadCodes(); }, [session?.user?.id]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), toast.action ? 8000 : 4500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [hasUnsavedChanges]);
  useEffect(() => { if (!isPhone) setSheetOpen(false); }, [isPhone]);
  useEffect(() => { if (sheetOpen && isPhone) sheetClose.current?.focus(); }, [sheetOpen, isPhone]);

  function canDiscard() { return !busy && (!hasUnsavedChanges || window.confirm("Discard your unsaved QR code changes?")); }
  function change<K extends keyof QRCodeInput>(key: K, value: QRCodeInput[K]) {
    setForm(old => ({ ...old, [key]: value }));
    if (key === "name" || key === "destination") setFieldErrors(old => ({ ...old, [key]: undefined }));
    setSaveError("");
  }
  function design<K extends keyof QRDesign>(key: K, value: QRDesign[K]) { setForm(old => ({ ...old, design: { ...old.design, [key]: value } })); setSaveError(""); }
  function utm(key: keyof QRCodeInput["utm"], value: string | boolean) { setForm(old => ({ ...old, utm: { ...old.utm, [key]: value } })); }
  function openEditor(input: QRCodeInput, saved: QRCodeInput, record: QRCodeRecord | null) {
    setEditing(record); setForm(input); setSavedInput(saved); setFieldErrors({}); setSaveError(""); setBulkResult(""); setSheetOpen(false); setView("editor"); setError("");
    window.scrollTo({ top: 0 });
  }
  function navigate(next: View) {
    if (busy) return;
    if (view === "editor" && next !== "editor" && hasUnsavedChanges) { if (!canDiscard()) return; setForm(savedInput); }
    setView(next); setError(""); setSheetOpen(false);
    if (next === "codes") void loadCodes();
    window.scrollTo({ top: 0 });
  }
  function newCode() { if (!canDiscard()) return; const fresh = initialForm(); openEditor(fresh, fresh, null); }
  function editCode(code: QRCodeRecord) { if (code.archivedAt || !canDiscard()) return; const input = editableInput(code); openEditor(input, input, code); }
  function duplicateCode(code: QRCodeRecord) {
    if (!canDiscard()) return;
    openEditor({ ...editableInput(code), name: `${code.name} — copy`, status: "active", expiresAt: null }, initialForm(), null);
    setToast({ message: "Copy ready. Save it to create a new tracking link." });
  }

  function validate() {
    const errors: Partial<Record<FieldName, string>> = {};
    try { const url = new URL(form.destination); if (!["https:", "http:"].includes(url.protocol)) errors.destination = "Use an https:// or http:// address."; }
    catch { errors.destination = "Enter a complete address, starting with https://."; }
    if (!form.name.trim()) errors.name = "Add a name to save this code.";
    return errors;
  }
  async function saveChanges() {
    const errors = validate();
    setFieldErrors(errors);
    const first = (["destination", "name"] as const).find(key => errors[key]);
    if (first) {
      setSheetOpen(false);
      requestAnimationFrame(() => {
        const input = document.getElementById(`field-${first}`);
        input?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
        input?.focus({ preventScroll: true });
      });
      return;
    }
    if (warnings.length) { setSaveError(warnings[0]); if (isPhone) setSheetOpen(true); return; }
    setBusy(true); setSaveError("");
    try {
      const result = await api<{ code: QRCodeRecord }>(editing ? `/api/codes/${editing.id}` : "/api/codes", { method: editing ? "PATCH" : "POST", body: JSON.stringify({ ...form, name: form.name.trim(), utm: { ...form.utm, campaign: form.utm.campaign || campaignLabel(form.event), content: form.utm.content || campaignLabel(form.placement) } }) });
      const input = editableInput(result.code);
      setEditing(result.code); setForm(input); setSavedInput(input); setCodes(old => [result.code, ...old.filter(code => code.id !== result.code.id)]);
      setToast({ message: "QR code saved." });
    } catch (e) { setSaveError(e instanceof Error ? e.message : "Could not save your QR code."); if (isPhone) setSheetOpen(true); }
    finally { setBusy(false); }
  }
  function primaryAction() { if (readyToDownload && editing) void exportSaved(editing, "png"); else void saveChanges(); }
  function submit(event: FormEvent) { event.preventDefault(); if (!readyToDownload) void saveChanges(); }

  async function exportSaved(code: QRCodeRecord, format: ExportFormat = "png") {
    if (code.archivedAt) return;
    setBusy(true); setError("");
    try { await exportQR(trackingLink(origin, code.slug), code.design, { format, size: Number(exportSize), name: code.name }); setToast({ message: `${format.toUpperCase()} downloaded.` }); }
    catch (e) { const message = e instanceof Error ? e.message : "Download failed."; if (view === "editor") setSaveError(message); else setError(message); }
    finally { setBusy(false); }
  }
  async function copyLink(code: QRCodeRecord) {
    try { await navigator.clipboard.writeText(trackingLink(origin, code.slug)); setToast({ message: "Tracking link copied." }); }
    catch { setError("Your browser blocked copying. Open the code and select its tracking link to copy it."); }
  }
  async function setStatus(code: QRCodeRecord, status: QRCodeInput["status"], offerUndo = true) {
    if (code.archivedAt) return;
    setBusy(true); setError("");
    try {
      const { code: updated } = await api<{ code: QRCodeRecord }>(`/api/codes/${code.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setCodes(old => old.map(item => item.id === code.id ? updated : item));
      if (editing?.id === updated.id) { setEditing(updated); setForm(old => ({ ...old, status: updated.status })); setSavedInput(old => ({ ...old, status: updated.status })); }
      setToast({
        message: updated.status === "active" ? "Code is active. Printed copies open the destination." : "Code paused. Printed copies show an unavailable page.",
        action: offerUndo ? { label: "Undo", run: () => void setStatus(updated, code.status, false) } : undefined,
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update the code."); }
    finally { setBusy(false); }
  }
  async function archiveCode() {
    if (!archiveTarget) return;
    setBusy(true); setError("");
    try {
      const { code } = await api<{ code: QRCodeRecord }>(`/api/codes/${archiveTarget.id}`, { method: "DELETE" });
      setCodes(old => old.map(item => item.id === code.id ? code : item));
      if (editing?.id === code.id) { const fresh = initialForm(); setEditing(null); setForm(fresh); setSavedInput(fresh); }
      setArchiveTarget(null); setToast({ message: "Code archived. Its scans and book requests stay in Results." });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not archive the code."); }
    finally { setBusy(false); }
  }
  async function restoreCode(code: QRCodeRecord) {
    setBusy(true); setError("");
    try {
      const { code: restored } = await api<{ code: QRCodeRecord }>(`/api/codes/${code.id}/restore`, { method: "POST", body: "{}" });
      setCodes(old => old.map(item => item.id === restored.id ? restored : item));
      setToast({ message: "Code restored and paused. Activate it when you’re ready." });
      requestAnimationFrame(() => codeFilterRef.current?.focus());
    } catch (e) { setError(e instanceof Error ? e.message : "Could not restore the code."); }
    finally { setBusy(false); }
  }
  function viewResults(code: QRCodeRecord) { setFilters(old => ({ ...old, event: "", codeId: code.id })); navigate("results"); }
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
    for (const row of rows) {
      try { await api("/api/codes", { method: "POST", body: JSON.stringify({ ...form, name: row[0], event: row[1] || form.event, placement: row[2] || form.placement, status: "active", utm: { ...form.utm, campaign: form.utm.campaign || campaignLabel(row[1] || form.event), content: form.utm.content || campaignLabel(row[2] || form.placement) } }) }); succeeded++; }
      catch { failed.push(row.join(" | ")); }
    }
    setBulk(failed.join("\n")); setBulkResult(`${succeeded} code${succeeded === 1 ? "" : "s"} created.${failed.length ? ` ${failed.length} could not be saved; those rows are still here to retry.` : " Each has its own tracking link."}`);
    await loadCodes(); setBusy(false);
  }

  if (!session) return <div className="center-page"><img src="/mastra-logo.svg" alt="Mastra" width="120" /><p role="status">{sessionError || "Loading QR Studio…"}</p>{sessionError && <button type="button" className="btn primary" onClick={() => void refreshSession()}>Try again</button>}</div>;
  if (!session.user) return <Auth session={session} onSignedIn={refreshSession} />;

  const previewValue = editing ? trackingLink(origin, editing.slug) : draftLink(origin || "https://qr.mastra.ai");
  const previewNote = session.mode === "private" ? `Private preview: scanners need preview access${session.booksPreviewOrigin && isBooksHome(form.destination) ? ", and Books links open the test form" : ""}. Don’t print for events yet.`
    : session.mode === "local" ? "Local preview: these links only open on this computer." : undefined;
  const stickerNote = session.mode === "private" ? "Private preview: test prints only. Attendees can’t open these links until there’s a public scan domain."
    : session.mode === "local" ? "Local preview: test prints only. These links only open on this computer." : undefined;
  const stateText = readyToDownload ? (form.status === "paused" ? "Saved · paused" : "Saved") : editing ? "Unsaved changes" : "Not saved";
  const primaryLabel = busy ? processingLogo ? "Adding logo…" : readyToDownload ? "Downloading…" : "Saving…" : readyToDownload ? "Download PNG" : editing ? "Save changes" : "Save code";
  const title = editing ? form.name.trim() || "Untitled code" : "New code";
  const fieldProps = (name: FieldName, hint?: string) => ({ id: `field-${name}`, "aria-invalid": fieldErrors[name] ? true : undefined, "aria-describedby": describedBy(`field-${name}`, hint, fieldErrors[name]) });
  const destinationHint = "Change it any time. Printed codes follow, and the tracking link stays the same.";

  return <div className="app">
    <header className="topbar" inert={behindSheet}>
      <div className="topbar-inner">
        <button type="button" className="brand" aria-label="QR Studio codes" disabled={busy} onClick={() => navigate("codes")}><img src="/mastra-logo.svg" alt="" /><span>QR Studio</span></button>
        <nav aria-label="Main">
          <button type="button" aria-current={view !== "results" ? "page" : undefined} disabled={busy} onClick={() => navigate("codes")}>Codes</button>
          <button type="button" aria-current={view === "results" ? "page" : undefined} disabled={busy} onClick={() => navigate("results")}>Results</button>
        </nav>
        <div className="topbar-end">
          {session.mode === "supabase" ? <><span className="account">{session.user.email}</span><button type="button" className="btn ghost small" disabled={busy} onClick={() => void signOut()}>Sign out</button></>
            : <span className="mode-chip"><span className="dot" aria-hidden="true" /><span className="mode-long">{session.mode === "local" ? "Local preview" : "Private preview"}</span><span className="mode-short">Preview</span></span>}
        </div>
      </div>
    </header>

    <main className={`main view-${view}`}>
      {error && !archiveTarget && <div className="page-alert" role="alert"><span>{error}</span><button type="button" className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><Icon name="close" /></button></div>}

      {view === "codes" && <CodesList codes={codes} origin={origin} loading={loadingCodes} busy={busy} search={search} onSearch={setSearch} filter={codeFilter} onFilter={setCodeFilter} onNew={newCode} filterRef={codeFilterRef}
        actions={{ edit: editCode, duplicate: duplicateCode, toggleStatus: code => void setStatus(code, code.status === "active" ? "paused" : "active"), archive: code => { setError(""); setArchiveTarget(code); }, restore: code => void restoreCode(code), results: viewResults, copy: code => void copyLink(code), download: code => void exportSaved(code), stickers: setStickerTarget }} />}

      {view === "results" && <Results codes={codes} filters={filters} onFilters={setFilters} historical={historical} onHistorical={setHistorical} />}

      {view === "editor" && <div className="page editor">
        <div className="editor-head" inert={behindSheet}>
          <button type="button" className="back-link" aria-label="Back to codes" disabled={busy} onClick={() => navigate("codes")}><Icon name="back" />Codes</button>
          <div className="editor-title">
            <h1>{title}</h1>
            {editing && <div className="status-control"><label htmlFor="field-status" className="sr-only">Code status</label>
              <select id="field-status" value={form.status} disabled={busy} onChange={event => change("status", event.target.value as QRCodeInput["status"])}><option value="active">Active</option><option value="paused">Paused</option></select></div>}
          </div>
        </div>

        <div className="editor-grid">
          <form className="editor-form" onSubmit={submit} noValidate inert={behindSheet}>
            <fieldset className="editor-fields" disabled={busy} aria-busy={busy}>
              <section className="form-section" aria-labelledby="link-heading">
                <h2 id="link-heading">Link</h2>
                <Field id="field-destination" label="Destination URL" hint={destinationHint} error={fieldErrors.destination}>
                  <input {...fieldProps("destination", destinationHint)} type="url" inputMode="url" autoComplete="url" value={form.destination} onChange={event => change("destination", event.target.value)} placeholder="https://www.mastrabooks.dev" />
                </Field>
                <Field id="field-name" label="Name" error={fieldErrors.name}>
                  <input {...fieldProps("name")} value={form.name} maxLength={120} onChange={event => change("name", event.target.value)} placeholder="e.g. Booth table — main hall" />
                </Field>
                <div className="grid-3">
                  <Field id="field-event" label="Event"><input id="field-event" value={form.event} maxLength={120} onChange={event => change("event", event.target.value)} placeholder="e.g. Northwind AI Summit 2027" /></Field>
                  <Field id="field-placement" label="Placement"><input id="field-placement" value={form.placement} maxLength={120} onChange={event => change("placement", event.target.value)} placeholder="e.g. Booth table" /></Field>
                  <Field id="field-book" label="Book label"><select id="field-book" value={form.book} onChange={event => change("book", event.target.value)}>{BOOKS.map(book => <option key={book}>{book}</option>)}</select></Field>
                </div>
                <p className="help">Optional. These labels group Results and don&rsquo;t change the Books form.</p>
              </section>

              <section className="form-section" aria-labelledby="look-heading">
                <h2 id="look-heading">Look</h2>
                <Group legend="Presets" hiddenLegend>
                  <div className="presets">{DESIGN_PRESETS.map(preset => {
                    const selected = JSON.stringify(form.design) === JSON.stringify(preset.design);
                    return <button type="button" key={preset.id} className="preset" aria-pressed={selected} title={preset.description} onClick={() => change("design", { ...preset.design })}>
                      <span className="preset-art" style={{ background: preset.design.background }}><QRPreview value="https://www.mastrabooks.dev" design={preset.design} size={56} alt="" /></span>{preset.name}
                    </button>;
                  })}</div>
                </Group>
                <div className="look-row">
                  <Group legend="Logo">
                    <div className="segmented">{([{ id: "mastra", text: "Mastra" }, { id: "none", text: "None" }, { id: "upload", text: "Upload" }] as const).map(item => <button type="button" key={item.id} aria-pressed={form.design.logo === item.id} onClick={() => design("logo", item.id)}>{item.text}</button>)}</div>
                  </Group>
                  <Field id="design-foreground" label="Color">
                    <span className="color-input"><input id="design-foreground" type="color" value={form.design.foreground} onChange={event => design("foreground", event.target.value)} /><span className="mono">{form.design.foreground.toUpperCase()}</span></span>
                  </Field>
                </div>
                {form.design.logo === "upload" && <Field id="design-logo-file" label="Logo file" hint="PNG, JPG or WebP, up to 2 MB.">
                  <div className="file-row">
                    <input id="design-logo-file" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="design-logo-file-hint" onChange={async event => {
                      const file = event.target.files?.[0]; if (!file) return;
                      setBusy(true); setProcessingLogo(true); setSaveError("");
                      try { design("logoData", await normalizeLogo(file)); setToast({ message: "Logo added." }); }
                      catch (failure) { setSaveError(failure instanceof Error ? failure.message : "Could not read the logo."); }
                      finally { setBusy(false); setProcessingLogo(false); }
                    }} />
                    {form.design.logoData && <img src={form.design.logoData} alt="Uploaded logo" width="40" height="40" />}
                  </div>
                </Field>}
                <details className="disclosure">
                  <summary><span className="summary-title">More styling</span><span className="summary-text">{styleSummary(form.design)}</span><Icon name="chevron" size={18} /></summary>
                  <div className="disclosure-body">
                    {form.design.logo !== "none" && <Field id="design-logo-size" label={`Logo size · ${Math.round(form.design.logoSize * 100)}%`} hint="Kept small so the code still scans.">
                      <input id="design-logo-size" type="range" min="12" max="22" value={Math.round(form.design.logoSize * 100)} aria-describedby="design-logo-size-hint" onChange={event => design("logoSize", Number(event.target.value) / 100)} /></Field>}
                    <div className="grid-2">
                      {([{ key: "background", label: "Background" }, { key: "eyeColor", label: "Corner color" }] as const).map(item => <Field key={item.key} id={`design-${item.key}`} label={item.label}>
                        <span className="color-input"><input id={`design-${item.key}`} type="color" value={form.design[item.key]} onChange={event => design(item.key, event.target.value)} /><span className="mono">{form.design[item.key].toUpperCase()}</span></span></Field>)}
                    </div>
                    <div className="grid-2">
                      <Field id="design-gradient" label="Color style"><select id="design-gradient" value={form.design.gradient} onChange={event => design("gradient", event.target.value as QRDesign["gradient"])}><option value="none">Solid color</option><option value="linear">Linear gradient</option><option value="radial">Radial gradient</option></select></Field>
                      {form.design.gradient !== "none" && <Field id="design-gradient-color" label="Gradient end color"><span className="color-input"><input id="design-gradient-color" type="color" value={form.design.gradientColor} onChange={event => design("gradientColor", event.target.value)} /><span className="mono">{form.design.gradientColor.toUpperCase()}</span></span></Field>}
                    </div>
                    {form.design.gradient !== "none" && <Field id="design-gradient-angle" label={`Gradient angle · ${form.design.gradientRotation}°`}><input id="design-gradient-angle" type="range" min="0" max="360" value={form.design.gradientRotation} onChange={event => design("gradientRotation", Number(event.target.value))} /></Field>}
                    <Group legend="Dot style">
                      <div className="segmented dots">{(["square", "rounded", "dots", "classy"] as const).map(shape => <button type="button" key={shape} aria-pressed={form.design.dots === shape} onClick={() => design("dots", shape)}><span className={`pattern ${shape}`} aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</span>{DOT_LABELS[shape]}</button>)}</div>
                    </Group>
                    <div className="grid-2">
                      <Field id="design-corners" label="Corner frame"><select id="design-corners" value={form.design.corners} onChange={event => design("corners", event.target.value as QRDesign["corners"])}><option value="rounded">Rounded</option><option value="square">Square</option><option value="dot">Circle</option></select></Field>
                      <Field id="design-eyes" label="Corner center"><select id="design-eyes" value={form.design.eyes} onChange={event => design("eyes", event.target.value as QRDesign["eyes"])}><option value="square">Square</option><option value="rounded">Rounded</option><option value="dot">Circle</option></select></Field>
                    </div>
                    <div className="grid-2">
                      <Field id="design-frame" label="Print frame" hint="A frame makes the code smaller. Leave it off for 3″ stickers.">
                        <select id="design-frame" value={form.design.frame} aria-describedby="design-frame-hint" onChange={event => design("frame", event.target.value as QRDesign["frame"])}><option value="none">No frame</option><option value="bottom">Outline with caption</option><option value="banner">Filled frame with caption</option></select></Field>
                      {form.design.frame !== "none" && <Field id="design-frame-color" label="Frame color"><span className="color-input"><input id="design-frame-color" type="color" value={form.design.frameColor} onChange={event => design("frameColor", event.target.value)} /><span className="mono">{form.design.frameColor.toUpperCase()}</span></span></Field>}
                    </div>
                    {form.design.frame !== "none" && <Field id="design-caption" label="Frame caption"><input id="design-caption" value={form.design.caption} maxLength={80} onChange={event => design("caption", event.target.value)} /></Field>}
                  </div>
                </details>
              </section>

              <section className="form-section" aria-label="Tracking options">
                <details className="disclosure">
                  <summary><span className="summary-title">Tracking options</span><span className="summary-text">{form.utm.enabled ? "Campaign tags on" : "Campaign tags off"} · {form.expiresAt ? `Expires ${formatDate(form.expiresAt)}` : "No expiry"}</span><Icon name="chevron" size={18} /></summary>
                  <div className="disclosure-body">
                    <div className="switch-row">
                      <div><span className="field-label" id="utm-label">Campaign tags</span><p className="help" id="utm-help">Adds utm tags, so the destination&rsquo;s analytics can see which code sent each visit.</p></div>
                      <button type="button" role="switch" className="switch" aria-checked={form.utm.enabled} aria-labelledby="utm-label" aria-describedby="utm-help" onClick={() => utm("enabled", !form.utm.enabled)}><span /></button>
                    </div>
                    {form.utm.enabled && <>
                      <div className="grid-2">
                        <Field id="utm-source" label="Source"><input id="utm-source" value={form.utm.source} maxLength={160} onChange={event => utm("source", event.target.value)} placeholder="event" /></Field>
                        <Field id="utm-medium" label="Medium"><input id="utm-medium" value={form.utm.medium} maxLength={160} onChange={event => utm("medium", event.target.value)} placeholder="qr" /></Field>
                        <Field id="utm-campaign" label="Campaign"><input id="utm-campaign" value={form.utm.campaign} maxLength={160} onChange={event => utm("campaign", event.target.value)} placeholder={campaignLabel(form.event) || "northwind-ai-summit-2027"} /></Field>
                        <Field id="utm-content" label="Content"><input id="utm-content" value={form.utm.content} maxLength={160} onChange={event => utm("content", event.target.value)} placeholder={campaignLabel(form.placement) || "booth-table"} /></Field>
                      </div>
                      <p className="help">Campaign and content default to the event and placement.</p>
                    </>}
                    <Field id="field-expiry" label="Expiry date" hint="Optional. The link stops working at the end of this day (UTC).">
                      <input id="field-expiry" type="date" aria-describedby="field-expiry-hint" value={form.expiresAt?.slice(0, 10) || ""} onChange={event => change("expiresAt", event.target.value ? `${event.target.value}T23:59:59.999Z` : null)} /></Field>
                  </div>
                </details>
                <details className="disclosure">
                  <summary><span className="summary-title">Create several codes</span><span className="summary-text">Same destination and look, one per line</span><Icon name="chevron" size={18} /></summary>
                  <div className="disclosure-body">
                    <Field id="bulk-rows" label="One code per line" hint="name | event | placement · up to 25. Each gets its own tracking link.">
                      <textarea id="bulk-rows" rows={5} value={bulk} aria-describedby="bulk-rows-hint" onChange={event => setBulk(event.target.value)} placeholder={"SF booth | Northwind AI Summit 2027 | Booth\nNYC insert | NYC meetup | Book insert"} /></Field>
                    <div className="row"><button type="button" className="btn" onClick={() => void createBulk()}>{busy ? "Creating…" : "Create codes"}</button>{bulkResult && <p role="status" className="help">{bulkResult}</p>}</div>
                  </div>
                </details>
              </section>
            </fieldset>
          </form>

          <aside className={`art-panel ${sheetOpen ? "open" : ""}`} id="artwork-panel" aria-label="Artwork and downloads" role={isPhone && sheetOpen ? "dialog" : undefined} aria-modal={isPhone && sheetOpen ? true : undefined}
            onKeyDown={event => { if (event.key === "Escape" && sheetOpen) setSheetOpen(false); }}>
            <div className="sheet-head"><strong>{title}</strong><button type="button" ref={sheetClose} className="icon-button" aria-label="Close preview" onClick={() => setSheetOpen(false)}><Icon name="close" size={18} /></button></div>
            <div className="art-state">
              <span className={`state ${readyToDownload ? "saved" : editing ? "dirty" : ""}`} role="status">{stateText}</span>
              {readyToDownload && <><label htmlFor="export-size" className="sr-only">PNG size</label><select id="export-size" className="small-select" disabled={busy} value={exportSize} onChange={event => setExportSize(event.target.value)}><option value="1024">PNG 1,024 px</option><option value="2048">PNG 2,048 px</option><option value="4096">PNG 4,096 px</option></select></>}
            </div>
            <div className="art-stage">
              <QRPreview value={previewValue} design={form.design} size={260} />
              {!editing && <span className="draft-band">Preview only · not a tracking link</span>}
            </div>
            {editing ? <div className="link-row"><input readOnly aria-label="Tracking link" value={trackingLink(origin, editing.slug)} onFocus={event => event.target.select()} /><button type="button" className="btn ghost small" onClick={() => void copyLink(editing)}><Icon name="copy" />Copy</button></div>
              : <p className="help">Saving creates the permanent tracking link. Downloads unlock after that.</p>}
            {previewNote && <p className="note">{previewNote}</p>}
            {warnings.map(message => <p className="inline-alert" role="alert" key={message}>{message}</p>)}
            {saveError && !warnings.includes(saveError) && <p className="inline-alert" role="alert">{saveError}</p>}
            <button type="button" className="btn primary block" disabled={busy} onClick={primaryAction}><Icon name={readyToDownload ? "download" : "check"} />{primaryLabel}</button>
            <div className="formats">
              <span>Also</span>
              {(["svg", "pdf"] as ExportFormat[]).map(format => <button type="button" key={format} className="text-button" aria-label={`Download ${format.toUpperCase()}`} disabled={busy || !readyToDownload} onClick={() => editing && void exportSaved(editing, format)}>{format.toUpperCase()}</button>)}
              <button type="button" className="btn small" disabled={busy || !readyToDownload} onClick={() => editing && setStickerTarget(editing)}>Sticker sheet…</button>
            </div>
            {editing && hasUnsavedChanges && <p className="help">Save your changes to download.</p>}
            {editing && <div className="art-stats"><span>{formatNumber(editing.scans)} scan{editing.scans === 1 ? "" : "s"}</span><button type="button" className="text-button" disabled={busy} onClick={() => viewResults(editing)}>Results →</button></div>}
          </aside>
        </div>

        {isPhone && <div className="mobile-bar" inert={behindSheet}>
          <button type="button" className="mini-art" aria-label={sheetOpen ? "Hide artwork and downloads" : "Show artwork and downloads"} aria-expanded={sheetOpen} aria-controls="artwork-panel" onClick={() => setSheetOpen(open => !open)}><QRPreview value={previewValue} design={form.design} size={44} alt="" /></button>
          <div className="mini-meta"><strong className={saveError || Object.values(fieldErrors).some(Boolean) ? "error-text" : undefined}>{saveError || Object.values(fieldErrors).some(Boolean) ? "Check the form" : stateText}</strong><span>{sheetOpen ? "Artwork and downloads" : "Tap the code to preview"}</span></div>
          <button type="button" className="btn primary" disabled={busy} onClick={primaryAction}>{busy ? "…" : readyToDownload ? "Download" : "Save"}</button>
        </div>}
      </div>}
    </main>

    {toast && <div className={`toast ${view === "editor" ? "above-bar" : ""}`} role="status"><Icon name="check" /><span>{toast.message}</span>
      {toast.action && <button type="button" className="text-button" onClick={() => { const run = toast.action!.run; setToast(null); run(); }}>{toast.action.label}</button>}
      <button type="button" className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}><Icon name="close" /></button></div>}

    {archiveTarget && <Dialog labelledBy="archive-heading" describedBy="archive-description" onClose={() => setArchiveTarget(null)} busy={busy} fallbackFocus={codeFilterRef}>
      <h2 id="archive-heading">Archive “{archiveTarget.name}”?</h2>
      <p id="archive-description">Printed copies will stop opening the destination. Its {formatNumber(archiveTarget.scans)} scan{archiveTarget.scans === 1 ? "" : "s"} and book requests stay in Results, and you can restore it later.</p>
      {error && <p className="inline-alert" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="btn ghost" data-autofocus disabled={busy} onClick={() => setArchiveTarget(null)}>Cancel</button>
        {archiveTarget.status === "active" && <button type="button" className="btn" disabled={busy} onClick={() => { const target = archiveTarget; setArchiveTarget(null); void setStatus(target, "paused"); }}>Pause instead</button>}
        <button type="button" className="btn danger" disabled={busy} onClick={() => void archiveCode()}>{busy ? "Archiving…" : "Archive code"}</button>
      </div>
    </Dialog>}

    {stickerTarget && <StickerSheetDialog code={stickerTarget} link={trackingLink(origin, stickerTarget.slug)} note={stickerNote} onClose={() => setStickerTarget(null)} onDone={message => setToast({ message })} fallbackFocus={codeFilterRef} />}
  </div>;
}

function Auth({ session, onSignedIn }: { session: SessionInfo; onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ confirmationRequired?: boolean; message?: string }>(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) });
      if (result.confirmationRequired) { setNotice(result.message || "Check your email to confirm your account, then sign in."); setMode("login"); }
      else await onSignedIn();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); }
    finally { setBusy(false); }
  }
  const passwordHint = mode === "signup" ? "Use at least 12 characters." : undefined;
  return <div className="center-page">
    <form className="auth-card" onSubmit={event => void submit(event)}>
      <img src="/mastra-logo.svg" alt="Mastra" width="110" />
      <h1>{mode === "login" ? "Sign in to QR Studio" : "Create your QR Studio account"}</h1>
      {!session.configured && <p className="inline-alert">The account service isn&rsquo;t connected yet. Connect it before signing in.</p>}
      <Field id="auth-email" label="Work email"><input id="auth-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" placeholder="you@mastra.ai" /></Field>
      <Field id="auth-password" label="Password" hint={passwordHint}><input id="auth-password" type="password" value={password} aria-describedby={passwordHint ? "auth-password-hint" : undefined} onChange={event => setPassword(event.target.value)} required minLength={mode === "signup" ? 12 : 1} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></Field>
      {error && <p className="inline-alert" role="alert">{error}</p>}
      {notice && <p className="note" role="status">{notice}</p>}
      <button type="submit" disabled={busy || !session.configured} className="btn primary block">{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}</button>
      <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setNotice(""); }}>{mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
    </form>
  </div>;
}
