import type { jsPDF as JsPDF } from "jspdf";
import type { QRDesign } from "./qr-design";

/**
 * Print-at-home sticker sheets. All lengths are inches.
 *
 * The 3" square layout was measured from the Premium Label Supply PLS451 product
 * image and matches Avery 94101's published template: 0.625" margins on every
 * side, 1.25" between columns and 0.375" between rows on US Letter. No official
 * PLS451 template was available, so the alignment test page is the check.
 */
export type StickerTemplate = {
  id: string;
  name: string;
  detail: string;
  pageWidth: number;
  pageHeight: number;
  label: number;
  columns: number[];
  rows: number[];
};

export const STICKER_TEMPLATES: StickerTemplate[] = [
  { id: "square-3in-6", name: "3″ × 3″ square · 6 per sheet", detail: "PLS451 · Avery 94101 layout", pageWidth: 8.5, pageHeight: 11, label: 3, columns: [0.625, 4.875], rows: [0.625, 4, 7.375] },
];

/** Kept clear of the label edge so a small printer shift cannot clip the code. */
export const SAFETY_INSET = 1 / 16;
/** A non-white background extends past the cut edge so a shifted print leaves no white sliver. */
export const BLEED = 1 / 16;
/** Printer offsets move in 1/32" steps, up to a quarter inch either way. */
export const OFFSET_STEP = 1 / 32;
export const MAX_OFFSET = 1 / 4;
/** Raster resolution for the embedded label artwork. */
export const PRINT_DPI = 600;

export type Offset = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type LabelSlot = { index: number; label: Rect; art: Rect; bleed: Rect | null };

export function labelPositions(template: StickerTemplate): Rect[] {
  return template.rows.flatMap(y => template.columns.map(x => ({ x, y, width: template.label, height: template.label })));
}

export function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const steps = Math.round(value / OFFSET_STEP);
  const limit = Math.round(MAX_OFFSET / OFFSET_STEP);
  return Math.max(-limit, Math.min(limit, steps)) * OFFSET_STEP;
}

export function formatOffset(value: number): string {
  const steps = Math.round(clampOffset(value) / OFFSET_STEP);
  if (steps === 0) return "0″";
  let numerator = Math.abs(steps);
  let denominator = 32;
  while (numerator % 2 === 0 && denominator > 1) { numerator /= 2; denominator /= 2; }
  return `${steps > 0 ? "+" : "−"}${denominator === 1 ? numerator : `${numerator}/${denominator}`}″`;
}

/** Fit artwork of any aspect ratio inside the label's safe square, centered. */
export function fitArtwork(aspect: number, template: StickerTemplate): { width: number; height: number } {
  const box = template.label - 2 * SAFETY_INSET;
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  return ratio >= 1 ? { width: box, height: box / ratio } : { width: box * ratio, height: box };
}

export function needsBleed(design: Pick<QRDesign, "background" | "frame" | "frameColor">): boolean {
  const fill = design.frame === "banner" ? design.frameColor : design.background;
  return !/^#f{6}$/i.test(fill);
}

export function sheetLayout(template: StickerTemplate, positions: number[], offset: Offset, aspect: number, bleed: boolean): LabelSlot[] {
  const art = fitArtwork(aspect, template);
  const dx = clampOffset(offset.x);
  const dy = clampOffset(offset.y);
  const slots = labelPositions(template);
  return [...new Set(positions)].filter(index => Number.isInteger(index) && index >= 0 && index < slots.length).sort((a, b) => a - b).map(index => {
    const label = { ...slots[index], x: slots[index].x + dx, y: slots[index].y + dy };
    return {
      index,
      label,
      art: { x: label.x + (template.label - art.width) / 2, y: label.y + (template.label - art.height) / 2, width: art.width, height: art.height },
      bleed: bleed ? { x: label.x - BLEED, y: label.y - BLEED, width: template.label + 2 * BLEED, height: template.label + 2 * BLEED } : null,
    };
  });
}

/** Pixel width for rasterizing label artwork at print resolution. */
export function printPixels(template: StickerTemplate, aspect = 1): number {
  return Math.round(fitArtwork(aspect, template).width * PRINT_DPI);
}

export type SheetImage = { dataUrl: string; aspect: number };

/** Draws the sheet onto a jsPDF document. Node tests pass an encoded PNG; browsers pass the rasterized SVG. */
export function drawStickerSheet(pdf: JsPDF, template: StickerTemplate, image: SheetImage, options: { positions: number[]; offset: Offset; background: string; bleed: boolean }) {
  for (const slot of sheetLayout(template, options.positions, options.offset, image.aspect, options.bleed)) {
    if (slot.bleed) {
      pdf.setFillColor(options.background);
      pdf.rect(slot.bleed.x, slot.bleed.y, slot.bleed.width, slot.bleed.height, "F");
    }
    pdf.addImage(image.dataUrl, "PNG", slot.art.x, slot.art.y, slot.art.width, slot.art.height, "qr-label", "NONE");
  }
}

export function drawAlignmentTest(pdf: JsPDF, template: StickerTemplate, offset: Offset) {
  const dx = clampOffset(offset.x);
  const dy = clampOffset(offset.y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(70);
  pdf.text(`Alignment test · ${template.name} · print at 100% (Actual size) on plain paper, then hold it against a label sheet to the light.`, template.columns[0], 0.38);
  pdf.text(`Printer offset: across ${formatOffset(dx)}, down ${formatOffset(dy)}. Each dashed square should sit exactly on a label.`, template.columns[0], 0.52);
  labelPositions(template).forEach((slot, index) => {
    const x = slot.x + dx;
    const y = slot.y + dy;
    pdf.setDrawColor(120);
    pdf.setLineWidth(0.008);
    pdf.setLineDashPattern([0.06, 0.05], 0);
    pdf.rect(x, y, template.label, template.label, "S");
    pdf.setLineDashPattern([], 0);
    pdf.setDrawColor(200);
    pdf.rect(x + SAFETY_INSET, y + SAFETY_INSET, template.label - 2 * SAFETY_INSET, template.label - 2 * SAFETY_INSET, "S");
    pdf.setDrawColor(120);
    const cx = x + template.label / 2;
    const cy = y + template.label / 2;
    pdf.line(cx - 0.15, cy, cx + 0.15, cy);
    pdf.line(cx, cy - 0.15, cx, cy + 0.15);
    pdf.text(String(index + 1), x + 0.12, y + 0.22);
  });
  const ruleX = template.columns[template.columns.length - 1];
  const ruleY = template.pageHeight - 0.3;
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.01);
  pdf.line(ruleX, ruleY, ruleX + 1, ruleY);
  pdf.line(ruleX, ruleY - 0.06, ruleX, ruleY + 0.06);
  pdf.line(ruleX + 1, ruleY - 0.06, ruleX + 1, ruleY + 0.06);
  pdf.text("1 inch: measure this line to confirm 100% scale", ruleX + 1.12, ruleY + 0.03);
}

export async function newSheetDocument(template: StickerTemplate, title: string): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "in", format: [template.pageWidth, template.pageHeight], orientation: "portrait", compress: true });
  pdf.setProperties({ title, creator: "Mastra QR Studio" });
  return pdf;
}
