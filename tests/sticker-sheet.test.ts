import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import sharp from "sharp";
import jsQR from "jsqr";
import { DEFAULT_DESIGN, DESIGN_PRESETS } from "../lib/qr-design";
import { createSVG } from "../lib/qr-export";
import {
  BLEED, SAFETY_INSET, STICKER_TEMPLATES, clampOffset, drawAlignmentTest, drawStickerSheet, fitArtwork, formatOffset,
  labelPositions, needsBleed, newSheetDocument, sheetLayout,
} from "../lib/sticker-sheet";

const template = STICKER_TEMPLATES[0];
const LINK = "https://mastra-qr-studio-6s8qterk9-ashwinm546.vercel.app/q/Xk3pQ9vR2mTa";

test("3-inch template matches the measured PLS451 / Avery 94101 layout", () => {
  const labels = labelPositions(template);
  assert.equal(labels.length, 6);
  const right = template.pageWidth - Math.max(...labels.map(l => l.x + l.width));
  const bottom = template.pageHeight - Math.max(...labels.map(l => l.y + l.height));
  assert.deepEqual([labels[0].x, labels[0].y, right, bottom], [0.625, 0.625, 0.625, 0.625]);
  assert.equal(labels[1].x - (labels[0].x + 3), 1.25);
  assert.equal(labels[2].y - (labels[0].y + 3), 0.375);
  for (const a of labels) for (const b of labels) {
    if (a === b) continue;
    const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    assert.equal(overlap, false);
  }
});

test("printer offset snaps to 1/32 inch and is limited to a quarter inch", () => {
  assert.equal(clampOffset(0.04), 1 / 32);
  assert.equal(clampOffset(-2), -0.25);
  assert.equal(clampOffset(Number.NaN), 0);
  assert.equal(formatOffset(1 / 32), "+1/32″");
  assert.equal(formatOffset(-1 / 16), "−1/16″");
  assert.equal(formatOffset(0.25), "+1/4″");
  assert.equal(formatOffset(0), "0″");
});

test("artwork fills the safe square, and framed artwork is fitted by height", () => {
  assert.deepEqual(fitArtwork(1, template), { width: 3 - 2 * SAFETY_INSET, height: 3 - 2 * SAFETY_INSET });
  const framed = fitArtwork(0.84, template);
  assert.equal(framed.height, 3 - 2 * SAFETY_INSET);
  assert.ok(Math.abs(framed.width - 0.84 * framed.height) < 1e-9);
});

test("layout skips used labels, applies the offset, and bleeds only coloured backgrounds", () => {
  const slots = sheetLayout(template, [5, 2, 2, 9, -1, 3], { x: 1 / 32, y: -1 / 16 }, 1, true);
  assert.deepEqual(slots.map(s => s.index), [2, 3, 5]);
  const first = slots[0];
  assert.equal(first.label.x, 0.625 + 1 / 32);
  assert.equal(first.label.y, 4 - 1 / 16);
  assert.equal(first.art.x - first.label.x, SAFETY_INSET);
  assert.deepEqual(first.bleed, { x: first.label.x - BLEED, y: first.label.y - BLEED, width: 3 + 2 * BLEED, height: 3 + 2 * BLEED });
  assert.equal(needsBleed(DEFAULT_DESIGN), false);
  assert.equal(needsBleed(DESIGN_PRESETS[2].design), true);
  assert.equal(needsBleed({ ...DEFAULT_DESIGN, frame: "banner", frameColor: "#020202" }), true);
});

async function decodeOnLabel(design = DEFAULT_DESIGN) {
  const dpi = 200;
  const svg = await createSVG(LINK, design, 1600, { jsdom: JSDOM });
  const [, width, height] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!.map(Number);
  const [slot] = sheetLayout(template, [0], { x: 0, y: 0 }, width / height, false);
  const art = await sharp(Buffer.from(svg)).resize(Math.round(slot.art.width * dpi), Math.round(slot.art.height * dpi)).png().toBuffer();
  const label = await sharp({ create: { width: 3 * dpi, height: 3 * dpi, channels: 3, background: "#ffffff" } })
    .composite([{ input: art, left: Math.round((slot.art.x - slot.label.x) * dpi), top: Math.round((slot.art.y - slot.label.y) * dpi) }])
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(label.data), label.info.width, label.info.height)?.data;
}

test("a full-size label still decodes to the saved tracking link", async () => {
  assert.equal(await decodeOnLabel(), LINK);
  assert.equal(await decodeOnLabel(DESIGN_PRESETS[3].design), LINK, "Caption frames must also decode once fitted");
});

test("sheet and alignment PDFs are US Letter, with the artwork embedded once", async () => {
  const png = await sharp({ create: { width: 60, height: 60, channels: 3, background: "#000000" } }).png().toBuffer();
  const pdf = await newSheetDocument(template, "Test sheet");
  drawStickerSheet(pdf, template, { dataUrl: `data:image/png;base64,${png.toString("base64")}`, aspect: 1 }, { positions: [0, 1, 2, 3, 4, 5], offset: { x: 0, y: 0 }, background: "#ffffff", bleed: false });
  assert.deepEqual([pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight()], [8.5, 11]);
  const output = Buffer.from(pdf.output("arraybuffer")).toString("latin1");
  assert.ok(output.startsWith("%PDF"));
  assert.equal(output.match(/\/Subtype \/Image/g)?.length, 1);
  const alignment = await newSheetDocument(template, "Alignment");
  const outlines: number[][] = [];
  const rect = alignment.rect.bind(alignment);
  alignment.rect = ((x: number, y: number, w: number, h: number, style?: string | null) => { outlines.push([x, y, w, h]); return rect(x, y, w, h, style); }) as typeof alignment.rect;
  drawAlignmentTest(alignment, template, { x: 1 / 32, y: 0 });
  const cuts = outlines.filter(([, , w]) => w === 3);
  assert.deepEqual(cuts.map(([x, y]) => [x, y]), labelPositions(template).map(l => [l.x + 1 / 32, l.y]));
  assert.equal(alignment.getNumberOfPages(), 1);
});
