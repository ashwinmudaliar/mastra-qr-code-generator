"use client";

import { useId } from "react";
import type { Analytics } from "@/lib/types";

export function ScanChart({ days }: { days: Analytics["byDay"] }) {
  const gradientId = `scan-fill-${useId()}`;
  const total = days.reduce((sum, day) => sum + day.scans, 0);
  const peak = Math.max(0, ...days.map(day => day.scans));
  const roughStep = Math.max(1, peak / 4);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const multiple = [1, 2, 2.5, 5, 10].find(value => value >= roughStep / magnitude) ?? 10;
  const step = Math.ceil(multiple * magnitude);
  const maximum = step * 4;
  const width = 900;
  const height = 200;
  const inset = 8;
  const plotHeight = height - inset * 2;
  const ticks = [4, 3, 2, 1, 0].map(value => value * step);
  const y = (value: number) => height - inset - value / maximum * plotHeight;
  const x = (index: number) => days.length > 1 ? inset + index * (width - inset * 2) / (days.length - 1) : width / 2;
  const points = days.map((day, index) => `${x(index)},${y(day.scans)}`).join(" ");
  const chartHeight = "var(--scan-chart-height, 184px)";

  return (
    <div className="scan-chart" style={{ display: "grid", gridTemplateColumns: "max-content minmax(0, 1fr)", columnGap: 12, minHeight: 0 }}>
      <div className="chart-scale" aria-hidden="true" style={{ position: "relative", height: chartHeight, minWidth: `${Math.max(2, maximum.toLocaleString().length)}ch`, fontFamily: "var(--mono, monospace)", fontSize: 13, lineHeight: 1.2, fontVariantNumeric: "tabular-nums", color: "#b3b3b3" }}>
        {ticks.map(value => <span key={value} style={{ position: "absolute", right: 0, top: `${y(value) / height * 100}%`, transform: "translateY(-50%)", whiteSpace: "nowrap" }}>{value.toLocaleString()}</span>)}
      </div>
      <div className="chart-plot" style={{ position: "relative", height: chartHeight, minWidth: 0 }}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Daily scan activity: ${total.toLocaleString()} total visits. Highest daily count: ${peak.toLocaleString()}. Exact daily counts are in the expandable table below.`} style={{ display: "block", width: "100%", height: "100%", overflow: "visible" }}>
          <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7aff78" stopOpacity=".18" /><stop offset="100%" stopColor="#7aff78" stopOpacity="0" /></linearGradient></defs>
          {ticks.map(value => <line key={value} x1={inset} x2={width - inset} y1={y(value)} y2={y(value)} stroke="#303030" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />)}
          {total > 0 && days.length > 1 && <>
            <polygon points={`${x(0)},${y(0)} ${points} ${x(days.length - 1)},${y(0)}`} fill={`url(#${gradientId})`} />
            <polyline points={points} fill="none" stroke="#7aff78" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </>}
        </svg>
        {total > 0 && days.length === 1 && <span aria-hidden="true" style={{ position: "absolute", width: 8, height: 8, borderRadius: "50%", background: "#7aff78", left: "50%", top: `${y(days[0].scans) / height * 100}%`, transform: "translate(-50%, -50%)" }} />}
        {total === 0 && <div className="chart-empty" style={{ inset: 0, padding: 12, textAlign: "center" }}><strong style={{ fontSize: 14 }}>No scans in this period</strong><span style={{ fontSize: 13, lineHeight: 1.5 }}>Visits will appear after a saved link is opened.</span></div>}
      </div>
    </div>
  );
}
