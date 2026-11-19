import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { codeInputSchema, codePatchSchema } from "../../../lib/server/validation";

type Input = z.output<typeof codeInputSchema>;
type Patch = z.output<typeof codePatchSchema>;
export type CodeRow = Record<string, unknown>;
export class ArchivedCodeError extends Error {}
export type ScanQuery = { since: string; until: string; codeId?: string; offset: number };
export type WorkspaceStore = {
  list: (workspaceId: string, offset: number) => Promise<CodeRow[]>;
  create: (workspaceId: string, input: Input) => Promise<CodeRow>;
  update: (workspaceId: string, id: string, input: Patch) => Promise<CodeRow | null>;
  archive: (workspaceId: string, id: string) => Promise<CodeRow | null>;
  restore: (workspaceId: string, id: string) => Promise<CodeRow | null>;
  scans: (workspaceId: string, query: ScanQuery) => Promise<Record<string, unknown>[]>;
};

const columns = "id,slug,name,destination,event,book,placement,status,expires_at,archived_at,design,utm,created_at,updated_at";
const withScans = `${columns},scans:qr_studio_scans(count)`;
function databaseError(error: unknown) { if (error) throw new Error("Workspace database request failed"); }
function toRow(input: Input | Patch): Record<string, unknown> {
  // Validation permits editable fields only; still copy them explicitly here so
  // a future schema change cannot accidentally allow identity/ownership edits.
  const row: Record<string, unknown> = {};
  for (const key of ["name", "destination", "event", "book", "placement", "status", "design", "utm"] as const) {
    if (key in input) row[key] = input[key];
  }
  if ("expiresAt" in input) row.expires_at = input.expiresAt;
  return row;
}
function randomSlug(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(9)))).replace(/\+/g, "-").replace(/\//g, "_");
}

export function createWorkspaceStore(db: SupabaseClient): WorkspaceStore {
  async function scopedCode(workspaceId: string, id: string): Promise<CodeRow | null> {
    const { data, error } = await db.from("qr_studio_codes").select(withScans)
      .eq("private_workspace_id", workspaceId).is("owner_id", null).eq("id", id).maybeSingle();
    databaseError(error); return data;
  }
  async function setArchived(workspaceId: string, id: string, archive: boolean): Promise<CodeRow | null> {
    const now = new Date().toISOString();
    let query = db.from("qr_studio_codes").update({ archived_at: archive ? now : null, status: "paused", updated_at: now })
      .eq("private_workspace_id", workspaceId).is("owner_id", null).eq("id", id);
    // Conditional writes preserve the original archive time on repeats. Restoring
    // an already restored code never pauses a subsequently activated link.
    query = archive ? query.is("archived_at", null) : query.not("archived_at", "is", null);
    const { data, error } = await query.select(withScans).maybeSingle();
    databaseError(error); return data ?? scopedCode(workspaceId, id);
  }
  return {
    async list(workspaceId, offset) {
      const { data, error } = await db.from("qr_studio_codes").select(withScans)
        .eq("private_workspace_id", workspaceId).is("owner_id", null)
        .order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
      databaseError(error); return data ?? [];
    },
    async create(workspaceId, input) {
      const { data, error } = await db.from("qr_studio_codes").insert({
        ...toRow(input), id: crypto.randomUUID(), slug: randomSlug(), owner_id: null, private_workspace_id: workspaceId,
      }).select(columns).single();
      databaseError(error); if (!data) throw new Error("Code creation failed"); return data;
    },
    async update(workspaceId, id, input) {
      const { data, error } = await db.from("qr_studio_codes").update({ ...toRow(input), updated_at: new Date().toISOString() })
        .eq("private_workspace_id", workspaceId).is("owner_id", null).eq("id", id).is("archived_at", null).select(withScans).maybeSingle();
      databaseError(error);
      if (!data && (await scopedCode(workspaceId, id))?.archived_at) throw new ArchivedCodeError("Restore this archived code before editing it.");
      return data;
    },
    archive: (workspaceId, id) => setArchived(workspaceId, id, true),
    restore: (workspaceId, id) => setArchived(workspaceId, id, false),
    async scans(workspaceId, query) {
      let request = db.from("qr_studio_scans")
        .select("id,code_id,scanned_at,country,region,city,device,qr_studio_codes!inner(private_workspace_id,owner_id)")
        .eq("qr_studio_codes.private_workspace_id", workspaceId).is("qr_studio_codes.owner_id", null)
        .gte("scanned_at", query.since).lte("scanned_at", query.until)
        .order("scanned_at").order("id").range(query.offset, query.offset + 999);
      if (query.codeId) request = request.eq("code_id", query.codeId);
      const { data, error } = await request;
      databaseError(error);
      // The join exists only for access scoping; don't return ownership metadata.
      return (data ?? []).map(({ qr_studio_codes: _scope, ...scan }) => scan);
    },
  };
}
