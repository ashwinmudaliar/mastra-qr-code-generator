import { createClient } from "@supabase/supabase-js";
import { handleGateway } from "./core.ts";

// Only a SHA-256 verifier belongs in deployed source. The high-entropy bearer
// stays in Vercel's server-only QR_SCAN_GATEWAY_KEY environment variable.
const KEY_HASH = "__SCAN_GATEWAY_KEY_SHA256__";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((request: Request) => handleGateway(request, {
  keyHash: KEY_HASH,
  async findCode(slug) {
    const { data, error } = await db.from("qr_studio_codes")
      .select("id,destination,status,expires_at,utm").eq("slug", slug).maybeSingle();
    if (error) throw new Error("Code lookup unavailable");
    return data;
  },
  async insertScan(codeId, metadata) {
    const { error } = await db.from("qr_studio_scans").insert({ code_id: codeId, ...metadata });
    if (error) throw new Error("Scan storage unavailable");
  },
  onRecordingError() { console.error("QR Studio scan could not be recorded"); },
}));
