"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "Something went wrong. Please try again.");
  return data;
}

const PATHS: Record<string, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 6l-6 6 6 6" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  download: <path d="M12 4v11m-5-5 5 5 5-5M4 19h16" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  more: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  external: <path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5" />,
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{PATHS[name] ?? PATHS.plus}</svg>;
}

/** One labelled control. The label targets the control by id, never wraps a group of buttons. */
export function Field({ id, label, hint, error, children, className = "" }: { id: string; label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return <div className={`field ${error ? "has-error" : ""} ${className}`}>
    <label htmlFor={id}>{label}</label>
    {children}
    {error ? <p className="field-error" id={`${id}-error`}>{error}</p> : hint ? <p className="help" id={`${id}-hint`}>{hint}</p> : null}
  </div>;
}

export function describedBy(id: string, hint?: string, error?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

/** A labelled group of buttons or controls. */
export function Group({ legend, hiddenLegend = false, children, className = "" }: { legend: string; hiddenLegend?: boolean; children: ReactNode; className?: string }) {
  return <fieldset className={`group ${className}`}><legend className={hiddenLegend ? "sr-only" : undefined}>{legend}</legend>{children}</fieldset>;
}

export function Segmented<T extends string>({ value, options, onChange, label, disabled }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string; disabled?: boolean }) {
  return <div className="segmented" role="group" aria-label={label}>
    {options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} disabled={disabled} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean };

/** A button that opens a list of actions. Arrow keys move, Escape closes and returns focus. */
export function Menu({ label, items, disabled }: { label: string; items: MenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const close = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  function onKeyDown(event: KeyboardEvent) {
    const entries = [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); button.current?.focus(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); entries[(index + 1) % entries.length]?.focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); entries[(index - 1 + entries.length) % entries.length]?.focus(); }
    else if (event.key === "Home") { event.preventDefault(); entries[0]?.focus(); }
    else if (event.key === "End") { event.preventDefault(); entries.at(-1)?.focus(); }
    else if (event.key === "Tab") setOpen(false);
  }
  return <div className="menu">
    <button ref={button} type="button" className="icon-button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={() => setOpen(value => !value)}><Icon name="more" size={18} /></button>
    {open && <div className="menu-list" role="menu" id={id} ref={menu} aria-label={label} onKeyDown={onKeyDown}>
      {items.map(item => <button key={item.label} type="button" role="menuitem" className={item.danger ? "danger" : undefined} onClick={() => { setOpen(false); button.current?.focus(); item.onSelect(); }}>{item.label}</button>)}
    </div>}
  </div>;
}

/**
 * Modal dialog with a focus trap. Escape and the backdrop close it unless work is pending.
 * Keys are handled at the document so a control disabled while work is pending cannot
 * leak focus out of the dialog; when the work finishes, focus returns inside.
 */
export function Dialog({ labelledBy, describedBy: description, onClose, busy, children, className = "", fallbackFocus }: { labelledBy: string; describedBy?: string; onClose: () => void; busy?: boolean; children: ReactNode; className?: string; fallbackFocus?: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const pending = useRef(busy);
  useEffect(() => { close.current = onClose; pending.current = busy; });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus() ?? ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); else fallbackFocus?.current?.focus(); };
  }, [fallbackFocus]);
  useEffect(() => {
    const dialog = ref.current;
    if (busy || !dialog || dialog.contains(document.activeElement)) return;
    (dialog.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)") ?? dialog.querySelector<HTMLElement>("button:not(:disabled)") ?? dialog).focus();
  }, [busy]);
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const dialog = ref.current;
      if (!dialog) return;
      if (event.key === "Escape") { event.preventDefault(); if (!pending.current) close.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href]")];
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className={`dialog ${className}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-describedby={description} tabIndex={-1}>{children}</div>
  </div>;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function downloadCSV(name: string, rows: unknown[][]) {
  const text = rows.map(row => row.map(cell => { let value = String(cell ?? ""); if (/^[=+@\-\t\r]/.test(value)) value = "'" + value; return `"${value.replace(/"/g, '""')}"`; }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
export const formatTime = (value: string | number) => new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const formatNumber = (value: number) => value.toLocaleString();
export function destinationLabel(value: string) {
  try { const url = new URL(value); return `${url.hostname.replace(/^www\./, "")}${url.pathname}${url.search}`; } catch { return value; }
}
