"use client";

import { useEffect, useState } from "react";
import { createSVG } from "@/lib/qr-export";
import type { QRDesign } from "@/lib/qr-design";

export function QRPreview({ value, design, size = 260, className = "" }: { value: string; design: QRDesign; size?: number; className?: string }) {
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
      }).catch(error => { if (active) { setError(error instanceof Error ? error.message : "Could not render QR code."); setSource(null); } });
    }, 70);
    return () => { active = false; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [value, design]);
  return <div className={`qr-preview ${className}`} style={{ width: size, maxWidth: "100%", minHeight: source ? undefined : size, display: "grid", placeItems: "center" }}>
    {source ? <img src={source} width={size} alt="Customized QR code" style={{ width: "100%", height: "auto", display: "block" }} /> : <span role={error ? "alert" : "status"} style={{ fontSize: 12, color: error ? "#b63b3b" : "#748177", padding: 16, textAlign: "center" }}>{error || "Building your QR…"}</span>}
  </div>;
}

export default QRPreview;
