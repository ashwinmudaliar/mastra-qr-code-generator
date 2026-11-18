"use client";

import { useState, type RefObject } from "react";
import { useQRSource } from "./qr-preview";
import { Dialog, Field, Icon } from "./ui";
import { exportAlignmentTest, exportStickerSheet } from "@/lib/qr-export";
import { MAX_OFFSET, OFFSET_STEP, SAFETY_INSET, STICKER_TEMPLATES, clampOffset, formatOffset, labelPositions, type Offset } from "@/lib/sticker-sheet";
import type { QRCodeRecord } from "@/lib/types";

const OFFSET_KEY = "mastra-qr-studio:sticker-offset:v1";
const OFFSETS = Array.from({ length: Math.round(MAX_OFFSET / OFFSET_STEP) * 2 + 1 }, (_, index) => (index - Math.round(MAX_OFFSET / OFFSET_STEP)) * OFFSET_STEP);

function savedOffset(): Offset {
  try {
    const value = JSON.parse(localStorage.getItem(OFFSET_KEY) ?? "null");
    return { x: clampOffset(Number(value?.x ?? 0)), y: clampOffset(Number(value?.y ?? 0)) };
  } catch { return { x: 0, y: 0 }; }
}

export function StickerSheetDialog({ code, link, note, onClose, onDone, fallbackFocus }: { code: QRCodeRecord; link: string; note?: string; onClose: () => void; onDone: (message: string) => void; fallbackFocus?: RefObject<HTMLElement | null> }) {
  const [templateId, setTemplateId] = useState(STICKER_TEMPLATES[0].id);
  const template = STICKER_TEMPLATES.find(item => item.id === templateId) ?? STICKER_TEMPLATES[0];
  const slots = labelPositions(template);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [offset, setOffsetState] = useState<Offset>(savedOffset);
  const [working, setWorking] = useState<"sheet" | "test" | null>(null);
  const [error, setError] = useState("");
  const { source } = useQRSource(link, code.design);
  const positions = slots.map((_, index) => index).filter(index => !skipped.has(index));
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  const inset = `${(SAFETY_INSET / template.label) * 100}%`;

  function setOffset(next: Offset) {
    setOffsetState(next);
    try { localStorage.setItem(OFFSET_KEY, JSON.stringify(next)); } catch { /* storage is optional */ }
  }
  function toggle(index: number) {
    setSkipped(previous => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  }
  async function run(kind: "sheet" | "test") {
    setWorking(kind); setError("");
    try {
      if (kind === "sheet") { await exportStickerSheet(link, code.design, { templateId, positions, offset, name: code.name }); onDone("Sticker sheet downloaded. Print it at 100%."); }
      else { await exportAlignmentTest(offset, templateId); onDone("Alignment test downloaded. Print it on plain paper at 100%."); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The download failed. Try again."); }
    finally { setWorking(null); }
  }

  return <Dialog labelledBy="sticker-heading" describedBy="sticker-description" onClose={onClose} busy={!!working} className="sticker-dialog" fallbackFocus={fallbackFocus}>
    <div className="dialog-head">
      <div><h2 id="sticker-heading">Print on a sticker sheet</h2><p className="help" id="sticker-description">{code.name}</p></div>
      <button type="button" className="icon-button" aria-label="Close" disabled={!!working} onClick={onClose}><Icon name="close" size={18} /></button>
    </div>
    <div className="sticker-layout">
      <div className="sheet-preview" role="group" aria-label="Labels on the sheet" style={{ aspectRatio: `${template.pageWidth} / ${template.pageHeight}` }}>
        {slots.map((slot, index) => {
          const print = !skipped.has(index);
          return <button key={index} type="button" className="sheet-label" aria-pressed={print} aria-label={`Label ${index + 1}: ${print ? "print" : "skip"}`} disabled={!!working} onClick={() => toggle(index)}
            style={{ left: pct(slot.x, template.pageWidth), top: pct(slot.y, template.pageHeight), width: pct(slot.width, template.pageWidth), height: pct(slot.height, template.pageHeight) }}>
            {print ? source && <img src={source} alt="" style={{ left: inset, top: inset, width: `calc(100% - 2 * ${inset})`, height: `calc(100% - 2 * ${inset})` }} /> : <span>Skip</span>}
          </button>;
        })}
      </div>
      <div className="sticker-options">
        <Field id="sticker-template" label="Sheet" hint={template.detail}>
          <select id="sticker-template" value={templateId} disabled={!!working} onChange={event => setTemplateId(event.target.value)} aria-describedby="sticker-template-hint">
            {STICKER_TEMPLATES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <div className="field">
          <span className="field-label">Labels to print</span>
          <p className="sticker-count"><strong>{positions.length} of {slots.length}</strong><span className="help">Select a label on the sheet to skip it.</span></p>
        </div>
        <div className="offset-row">
          <Field id="offset-x" label="Printer offset across">
            <select id="offset-x" value={offset.x} disabled={!!working} onChange={event => setOffset({ ...offset, x: Number(event.target.value) })}>
              {OFFSETS.map(value => <option key={value} value={value}>{formatOffset(value)}</option>)}
            </select>
          </Field>
          <Field id="offset-y" label="Printer offset down">
            <select id="offset-y" value={offset.y} disabled={!!working} onChange={event => setOffset({ ...offset, y: Number(event.target.value) })}>
              {OFFSETS.map(value => <option key={value} value={value}>{formatOffset(value)}</option>)}
            </select>
          </Field>
        </div>
        <p className="help">Set the offset once from the alignment test. It's saved on this computer.</p>
        <p className="print-scale">Print at <strong>100% (Actual size)</strong>. Turn off “Fit to page”.</p>
        {note && <p className="note">{note}</p>}
        {error && <p className="inline-alert" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" disabled={!!working} onClick={() => void run("test")}>{working === "test" ? "Preparing…" : "Alignment test"}</button>
          <button type="button" className="btn primary" data-autofocus disabled={!!working || !positions.length} onClick={() => void run("sheet")}><Icon name="download" />{working === "sheet" ? "Preparing…" : "Download sheet PDF"}</button>
        </div>
      </div>
    </div>
  </Dialog>;
}
