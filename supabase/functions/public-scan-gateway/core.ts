import type { SupabaseClient } from "@supabase/supabase-js";
import { handleGateway } from "../scan-gateway/core";

/** The public scanner resolves only this configured private workspace. */
export function handlePublicScanGateway(request: Request, config: {
  db: SupabaseClient; keyHash: string; workspaceId: string;
}): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.workspaceId)) {
    return Promise.resolve(Response.json({ error: "Gateway not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } }));
  }
  return handleGateway(request, {
    keyHash: config.keyHash,
    async findCode(slug) {
      const { data, error } = await config.db.from("qr_studio_codes")
        .select("id,destination,status,expires_at,archived_at,utm,event,book,placement")
        .eq("private_workspace_id", config.workspaceId).is("owner_id", null).eq("slug", slug).maybeSingle();
      if (error) throw new Error("Code lookup unavailable");
      return data;
    },
    async insertScan(codeId, metadata, visit) {
      const { error } = await config.db.from("qr_studio_scans")
        .insert({ id: visit.id, scanned_at: visit.scannedAt, code_id: codeId, ...metadata });
      if (error) throw new Error("Scan storage unavailable");
    },
    onRecordingError() { console.error("Public QR scan could not be recorded"); },
  });
}
