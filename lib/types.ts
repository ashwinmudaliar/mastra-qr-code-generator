import type { QRDesign } from "./qr-design";
export type { QRDesign } from "./qr-design";
export type CodeStatus = "active" | "paused";
export type UTMSettings = {
  enabled: boolean;
  source: string;
  medium: string;
  campaign: string;
  content: string;
};
export type QRCodeInput = {
  name: string;
  destination: string;
  event: string;
  book: string;
  placement: string;
  status: CodeStatus;
  expiresAt: string | null;
  design: QRDesign;
  utm: UTMSettings;
};
export type QRCodeRecord = QRCodeInput & {
  id: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  scans: number;
};
export type DeviceType = "Mobile" | "Tablet" | "Desktop" | "Other";
export type ScanRecord = {
  id: string;
  codeId: string;
  scannedAt: string;
  country: string;
  region: string;
  city: string;
  device: DeviceType;
};
export type Analytics = {
  totalScans: number;
  activeCodes: number;
  countries: number;
  periodDays: number;
  byDay: { date: string; scans: number }[];
  byCountry: { name: string; scans: number }[];
  byEvent: { name: string; scans: number }[];
  byBook: { name: string; scans: number }[];
  byCity: { name: string; scans: number }[];
  byDevice: { name: string; scans: number }[];
  byCode: { id: string; name: string; scans: number }[];
  recent: (ScanRecord & { codeName: string })[];
};
export type SessionInfo = {
  configured: boolean;
  mode: "local" | "supabase" | "private";
  user: { id: string; email: string } | null;
};
