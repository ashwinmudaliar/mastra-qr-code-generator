"use client";

import { useEffect, useState } from "react";
import { createSVG } from "@/lib/qr-export";
import type { QRDesign } from "@/lib/qr-design";

/** Renders the exact export artwork and returns an object URL for it. */
export function useQRSource(value: string, design: QRDesign) {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    const timer = setTimeout(() => {
      createSVG(value, design, 1024).then(svg => {
        if (!active) return;
        url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        setSource(url); setError("");
      }).catch(failure => { if (active) { setError(failure instanceof Error ? failure.message : "Could not render QR code."); setSource(null); } });
    }, 70);
    return () => { active = false; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [value, design]);
  return { source, error };
}

export function QRPreview({ value, design, size = 260, className = "", alt = "QR code artwork" }: { value: string; design: QRDesign; size?: number; className?: string; alt?: string }) {
  const { source, error } = useQRSource(value, design);
  return <div className={`qr-preview ${className}`} style={{ width: size, maxWidth: "100%", minHeight: source ? undefined : size }}>
    {source ? <img src={source} width={size} alt={alt} /> : <span className={error ? "qr-preview-error" : "qr-preview-loading"} role={error ? "alert" : "status"}>{error || (size >= 120 ? "Building your QR…" : "")}</span>}
  </div>;
}

export default QRPreview;
