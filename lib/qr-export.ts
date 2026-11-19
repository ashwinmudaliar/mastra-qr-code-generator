import type { Options } from "qr-code-styling";
import { type QRDesign, contrastRatio } from "./qr-design";
import { STICKER_TEMPLATES, drawAlignmentTest, drawStickerSheet, needsBleed, newSheetDocument, printPixels, type Offset } from "./sticker-sheet";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEX = /^#[0-9a-f]{6}$/i;
const RASTER_DATA = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export type ExportFormat = "png" | "svg" | "pdf";
export type QRExportOptions = { format: ExportFormat; size?: number; name?: string };

// The Mastra symbol from https://mastrabooks.dev/mastra-logo.svg.
const MASTRA_SYMBOL = '<path d="M224.532 267.037C256.764 267.037 282.899 292.926 282.899 324.867C282.899 356.807 256.764 382.696 224.532 382.696C192.301 382.695 166.174 356.806 166.174 324.867C166.174 292.927 192.302 267.038 224.532 267.037Z"/><path d="M300.93 116.704C333.161 116.704 359.295 142.595 359.297 174.534C359.297 177.254 359.107 179.93 358.739 182.549C355.798 203.514 351.472 227.163 363.386 244.732L377.1 264.956L380.492 269.082C381.114 269.84 382.287 269.798 382.855 268.998L385.724 264.957L398.267 246.457C410.778 228.004 406.243 203.072 404.093 180.942C403.914 179.1 403.823 177.232 403.823 175.342C403.823 143.403 429.951 117.514 462.181 117.513C494.413 117.513 520.547 143.402 520.548 175.342C520.548 178.447 520.3 181.494 519.824 184.466C516.647 204.301 512.098 226.236 522.232 243.628L528.016 252.9C533.502 261.693 543.328 266.474 553.281 269.364C577.505 276.4 595.193 298.585 595.193 324.867C595.193 356.807 569.067 382.696 536.835 382.696C504.603 382.696 478.477 356.807 478.477 324.867C478.477 321.437 478.778 318.078 479.356 314.814C482.817 295.259 487.396 273.58 477.378 256.387L464.652 234.547L463.888 233.5C463.339 232.748 462.227 232.72 461.64 233.442L448.042 253.496C435.85 271.477 440.436 295.753 443.297 317.23C443.63 319.728 443.802 322.278 443.802 324.867C443.802 356.807 417.668 382.696 385.436 382.696C353.204 382.696 327.077 356.806 327.077 324.867C327.077 302.178 330.616 276.85 317.847 258.018L316.835 256.527C306.579 241.401 288.368 233.896 272.343 224.958C254.573 215.047 242.572 196.182 242.572 174.534C242.574 142.596 268.7 116.705 300.93 116.704Z"/>';

function color(value: string, fallback = "#15231b") { return HEX.test(value) ? value : fallback; }
function escapeXml(value: string) { return value.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!)); }
export function isRasterLogo(value: string) { return value.length <= 400_000 && RASTER_DATA.test(value); }

/** Fixed four-module quiet zone. An integer module size also keeps small previews sharp. */
export async function qrOptions(value: string, design: QRDesign, requestedSize = 1024): Promise<Options> {
  if (!value || value.length > 2048) throw new Error("Use a link between 1 and 2,048 characters.");
  const { default: qrcode } = await import("qrcode-generator");
  const matrix = qrcode(0, "H");
  matrix.addData(value, "Byte");
  matrix.make();
  const modules = matrix.getModuleCount();
  const size = Math.min(4096, Math.max(128, Math.round(requestedSize)));
  const moduleSize = Math.floor(size / (modules + 8));
  const margin = (size - moduleSize * modules) / 2;
  const gradient = design.gradient === "none" ? undefined : {
    type: design.gradient,
    rotation: Math.min(360, Math.max(0, design.gradientRotation)) * Math.PI / 180,
    colorStops: [{ offset: 0, color: color(design.foreground) }, { offset: 1, color: color(design.gradientColor) }],
  };
  return {
    width: size, height: size, type: "svg", data: value, margin,
    qrOptions: { errorCorrectionLevel: "H", mode: "Byte" },
    dotsOptions: { color: color(design.foreground), type: design.dots, gradient, roundSize: true },
    cornersSquareOptions: { color: color(design.eyeColor), type: design.corners === "rounded" ? "extra-rounded" : design.corners },
    cornersDotOptions: { color: color(design.eyeColor), type: design.eyes },
    backgroundOptions: { color: color(design.background, "#ffffff") },
  };
}

/** Shared SVG composition for the live preview and every download format. */
export function composeSVG(raw: string, design: QRDesign, size: number): string {
  const match = raw.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i);
  if (!match) throw new Error("Could not render this QR code.");
  const frame = design.frame !== "none";
  const framePadding = frame ? Math.round(size * 0.026) : 0;
  const captionHeight = frame ? Math.round(size * 0.14) : 0;
  const width = size + 2 * framePadding;
  const height = width + captionHeight;
  const foreground = color(design.foreground);
  const background = color(design.background, "#ffffff");
  const frameColor = color(design.frameColor);
  const captionColor = design.frame === "bottom" ? frameColor : (contrastRatio(frameColor, "#ffffff") >= 4.5 ? "#ffffff" : "#101710");
  let logo = "";
  if (design.logo === "mastra" || (design.logo === "upload" && isRasterLogo(design.logoData))) {
    const logoSize = size * Math.min(0.22, Math.max(0.12, design.logoSize));
    const padding = logoSize * 0.12;
    const x = (size - logoSize) / 2;
    const box = logoSize + padding * 2;
    logo = `<rect x="${x - padding}" y="${x - padding}" width="${box}" height="${box}" rx="${box * 0.1}" fill="${background}"/>`;
    if (design.logo === "mastra") logo += `<svg x="${x}" y="${x}" width="${logoSize}" height="${logoSize}" viewBox="156 96 450 306" fill="${foreground}">${MASTRA_SYMBOL}</svg>`;
    else logo += `<image x="${x}" y="${x}" width="${logoSize}" height="${logoSize}" href="${design.logoData}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const caption = design.caption.trim().slice(0, 80);
  // A conservative width estimate also keeps long all-capital captions inside the frame.
  const fontSize = Math.min(size * 0.042, (width - framePadding * 4) / Math.max(1, caption.length * 1.05));
  const outerFill = design.frame === "banner" ? frameColor : background;
  return `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="${frame ? size * 0.035 : 0}" fill="${outerFill}"/>${design.frame === "bottom" ? `<rect x="${framePadding / 2}" y="${framePadding / 2}" width="${width - framePadding}" height="${height - framePadding}" rx="${size * 0.025}" fill="none" stroke="${frameColor}" stroke-width="${Math.max(2, size * 0.004)}"/>` : ""}<g transform="translate(${framePadding},${framePadding})">${match[1]}${logo}</g>${frame ? `<text x="${width / 2}" y="${width + captionHeight * 0.56}" text-anchor="middle" dominant-baseline="middle" fill="${captionColor}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" letter-spacing="${fontSize * 0.055}">${escapeXml(caption)}</text>` : ""}</svg>`;
}

/** jsdom can be injected by Node tests; browsers need no extra environment. */
export async function createSVG(value: string, design: QRDesign, size = 1024, environment?: Pick<Options, "jsdom">): Promise<string> {
  const { default: QRCodeStyling } = await import("qr-code-styling");
  const options = await qrOptions(value, design, size);
  const qr = new QRCodeStyling({ ...options, ...environment });
  const data = await qr.getRawData("svg");
  if (!data) throw new Error("Could not generate this QR code.");
  const raw = data instanceof Blob ? await data.text() : new TextDecoder().decode(data as unknown as Uint8Array);
  return composeSVG(raw, design, options.width || size);
}

async function rasterize(svg: string, width: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round(width * img.naturalHeight / img.naturalWidth);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const fileName = (name: string) => name.replace(/[^a-z0-9_-]/gi, "-").slice(0, 90) || "mastra-qr";

export async function exportQR(value: string, design: QRDesign, { format, size = 2048, name = "mastra-qr" }: QRExportOptions) {
  const safeName = fileName(name);
  const svg = await createSVG(value, design, size);
  if (format === "svg") return download(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${safeName}.svg`);
  const canvas = await rasterize(svg, size);
  if (format === "png") {
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not export PNG.")), "image/png"));
    return download(blob, `${safeName}.png`);
  }
  const { jsPDF } = await import("jspdf");
  const printWidth = 100;
  const printHeight = printWidth * canvas.height / canvas.width;
  const pdf = new jsPDF({ unit: "mm", format: [printWidth + 20, printHeight + 20], orientation: "portrait", compress: true });
  pdf.setProperties({ title: safeName, creator: "Mastra QR Studio" });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, 10, printWidth, printHeight);
  pdf.save(`${safeName}.pdf`);
}

export type StickerSheetOptions = { templateId?: string; positions: number[]; offset: Offset; name?: string };

function stickerTemplate(id?: string) {
  const template = STICKER_TEMPLATES.find(item => item.id === id) ?? STICKER_TEMPLATES[0];
  return template;
}

/** A Letter PDF at physical size: the saved artwork placed on each selected label. */
export async function exportStickerSheet(value: string, design: QRDesign, { templateId, positions, offset, name = "mastra-qr" }: StickerSheetOptions) {
  if (!positions.length) throw new Error("Choose at least one label to print.");
  const template = stickerTemplate(templateId);
  const svg = await createSVG(value, design, 1600);
  const [, width, height] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)?.map(Number) ?? [0, 1, 1];
  const aspect = width / height;
  const canvas = await rasterize(svg, printPixels(template, aspect));
  const pdf = await newSheetDocument(template, `${name} sticker sheet`);
  drawStickerSheet(pdf, template, { dataUrl: canvas.toDataURL("image/png"), aspect }, { positions, offset, background: design.frame === "banner" ? color(design.frameColor) : color(design.background, "#ffffff"), bleed: needsBleed(design) });
  pdf.save(`${fileName(name)}-sticker-sheet.pdf`);
}

export async function exportAlignmentTest(offset: Offset, templateId?: string) {
  const template = stickerTemplate(templateId);
  const pdf = await newSheetDocument(template, "Sticker sheet alignment test");
  drawAlignmentTest(pdf, template, offset);
  pdf.save("sticker-alignment-test.pdf");
}

/** Raster-only import is decoded and re-encoded, stripping metadata and active content. */
export async function normalizeLogo(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG, or WebP logo.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Choose a logo smaller than 2 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("This image could not be read.");
    const factor = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this logo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png");
    if (!isRasterLogo(data)) throw new Error("This logo is too complex. Try a smaller image.");
    return data;
  } catch (error) {
    if (error instanceof Error && error.name !== "EncodingError") throw error;
    throw new Error("This image could not be read. Try another PNG or JPG.");
  } finally { URL.revokeObjectURL(url); }
}
