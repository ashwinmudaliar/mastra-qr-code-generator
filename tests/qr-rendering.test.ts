import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import sharp from "sharp";
import jsQR from "jsqr";
import { DEFAULT_DESIGN, DESIGN_PRESETS, getDesignWarnings, type QRDesign } from "../lib/qr-design";
import { composeSVG, createSVG, isRasterLogo, qrOptions } from "../lib/qr-export";

const LINK = "https://qr.mastra.ai/q/ai-engineer-2027-books";

async function decode(design: QRDesign, size = 640) {
  const svg = await createSVG(LINK, design, size, { jsdom: JSDOM });
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  assert.equal(result?.data, LINK, `Export must decode with ${JSON.stringify({ dots: design.dots, corners: design.corners, eyes: design.eyes, gradient: design.gradient, frame: design.frame, logo: design.logo })}`);
  return svg;
}

for (const preset of DESIGN_PRESETS) {
  test(`export decodes: ${preset.name} preset with actual Mastra logo`, async () => {
    await decode(preset.design);
  });
}

test("dot and corner choices decode with a large logo, gradient, and caption frame", async () => {
  const styles: QRDesign["dots"][] = ["square", "rounded", "dots", "classy"];
  for (const dots of styles) {
    for (const corners of ["square", "rounded", "dot"] as const) {
      await decode({ ...DEFAULT_DESIGN, dots, corners, eyes: corners, logoSize: 0.22, gradient: "radial", frame: "banner" });
    }
  }
});

test("uploaded raster logo remains embedded and scan-readable", async () => {
  const png = await sharp({ create: { width: 80, height: 80, channels: 4, background: "#2f684c" } }).png().toBuffer();
  const logoData = `data:image/png;base64,${png.toString("base64")}`;
  const svg = await decode({ ...DEFAULT_DESIGN, logo: "upload", logoData, logoSize: 0.22, frame: "bottom" });
  assert.ok(svg.includes(logoData));
});

test("quiet zone preserves at least four modules on every side", async () => {
  const { default: qrcode } = await import("qrcode-generator");
  for (const value of ["a", LINK, LINK + "?" + "a".repeat(400)]) {
    const qr = qrcode(0, "H"); qr.addData(value, "Byte"); qr.make();
    const options = await qrOptions(value, DEFAULT_DESIGN, 1024);
    const moduleWidth = Math.floor(((options.width || 0) - 2 * (options.margin || 0)) / qr.getModuleCount());
    assert.ok((options.margin || 0) >= moduleWidth * 4);
    assert.equal(options.qrOptions?.errorCorrectionLevel, "H");
  }
});

test("caption is escaped and SVG upload strings cannot become active content", () => {
  const malicious = { ...DEFAULT_DESIGN, logo: "upload" as const, logoData: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj4=', frame: "bottom" as const, caption: '<script>alert("x")</script>', foreground: '#fff\" onclick=\"alert(1)' };
  const svg = composeSVG('<svg><path d="M0 0"/></svg>', malicious, 1024);
  assert.ok(!svg.includes("<script>"));
  assert.ok(!svg.includes("data:image/svg"));
  assert.ok(svg.includes("&lt;script&gt;"));
  assert.ok(!svg.includes("onclick"));
  assert.equal(isRasterLogo(malicious.logoData), false);
});

test("low-contrast and inverted codes are identified before printing", () => {
  assert.equal(getDesignWarnings(DEFAULT_DESIGN).length, 0);
  assert.ok(getDesignWarnings({ ...DEFAULT_DESIGN, foreground: "#cccccc" }).some(x => x.includes("contrast")));
  assert.ok(getDesignWarnings({ ...DEFAULT_DESIGN, foreground: "#ffffff", background: "#000000" }).some(x => x.includes("dark dots")));
});
