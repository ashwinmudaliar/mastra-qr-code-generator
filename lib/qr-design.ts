export type DotStyle = "square" | "rounded" | "dots" | "classy";
export type CornerStyle = "square" | "dot" | "rounded";
export type QRDesign = {
  foreground: string;
  background: string;
  gradient: "none" | "linear" | "radial";
  gradientColor: string;
  gradientRotation: number;
  eyeColor: string;
  dots: DotStyle;
  corners: CornerStyle;
  eyes: CornerStyle;
  logo: "none" | "mastra" | "upload";
  logoData: string;
  logoSize: number;
  frame: "none" | "bottom" | "banner";
  frameColor: string;
  caption: string;
};

export const DEFAULT_DESIGN: QRDesign = {
  foreground: "#020202", background: "#ffffff", gradient: "none",
  gradientColor: "#286748", gradientRotation: 45, eyeColor: "#020202",
  dots: "rounded", corners: "rounded", eyes: "square",
  logo: "mastra", logoData: "", logoSize: 0.18,
  frame: "none", frameColor: "#020202", caption: "SCAN FOR YOUR FREE BOOK",
};

export const DESIGN_PRESETS: { id: string; name: string; description: string; design: QRDesign }[] = [
  { id: "mastra", name: "Mastra", description: "Black modules, rounded corners, Mastra logo.", design: { ...DEFAULT_DESIGN } },
  { id: "classic", name: "Classic", description: "Square modules. Black on white. No logo.", design: { ...DEFAULT_DESIGN, foreground: "#111111", eyeColor: "#111111", dots: "square", corners: "square", logo: "none" } },
  { id: "mint", name: "Mint", description: "Circular modules on a pale green background.", design: { ...DEFAULT_DESIGN, foreground: "#153b2a", eyeColor: "#153b2a", background: "#dcffe9", dots: "dots", corners: "dot", eyes: "dot" } },
  { id: "violet", name: "After hours", description: "Purple gradient with a caption frame.", design: { ...DEFAULT_DESIGN, foreground: "#251344", eyeColor: "#251344", gradient: "linear", gradientColor: "#5b2382", background: "#fbf4ff", dots: "classy", frame: "bottom", frameColor: "#251344" } },
];

function luminance(hex: string) {
  const raw = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "000000";
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(raw.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function getDesignWarnings(design: QRDesign): string[] {
  const colors = [design.foreground, design.eyeColor, ...(design.gradient === "none" ? [] : [design.gradientColor])];
  const warnings: string[] = [];
  if (colors.some((color) => luminance(color) >= luminance(design.background))) warnings.push("Use dark dots on a light background for reliable scanning.");
  if (colors.some((color) => contrastRatio(color, design.background) < 4.5)) warnings.push("Increase the contrast between the code and background before printing.");
  if (design.logo === "upload" && !design.logoData) warnings.push("Upload a logo, or choose a different logo option.");
  return warnings;
}
