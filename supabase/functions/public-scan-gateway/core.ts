import type { SupabaseClient } from "@supabase/supabase-js";
import { handleGateway } from "../scan-gateway/core.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Scope is fixed at deployment; a request can never select an owner or workspace. */
export function handlePublicScanGateway(request: Request, config: {
  db: SupabaseClient; keyHash: string; scopeMode: string; workspaceId: string; ownerId: string;
}): Promise<Response> {
  const configured = config.scopeMode === "workspace"
    ? UUID.test(config.workspaceId) && config.ownerId === ""
    : config.scopeMode === "owner"
      ? UUID.test(config.ownerId) && config.workspaceId === ""
      : config.scopeMode === "transition" && UUID.test(config.workspaceId) && UUID.test(config.ownerId);
  if (!configured) {
    return Promise.resolve(Response.json({ error: "Gateway not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } }));
  }
  return handleGateway(request, {
    keyHash: config.keyHash,
    async findCode(slug) {
      let query = config.db.from("qr_studio_codes")
        .select("id,destination,status,expires_at,archived_at,utm,event,book,placement")
        .eq("slug", slug);
      if (config.scopeMode === "workspace") {
        query = query.eq("private_workspace_id", config.workspaceId).is("owner_id", null);
      } else if (config.scopeMode === "owner") {
        query = query.eq("owner_id", config.ownerId).is("private_workspace_id", null);
      } else {
        // Validated UUIDs are the only interpolated PostgREST syntax. This
        // temporary union keeps printed links working across the atomic move.
        query = query.or(`and(private_workspace_id.eq.${config.workspaceId},owner_id.is.null),and(owner_id.eq.${config.ownerId},private_workspace_id.is.null)`);
      }
      const { data, error } = await query.maybeSingle();
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
