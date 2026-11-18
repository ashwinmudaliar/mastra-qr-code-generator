import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { GatewayError, handle, type StoredRequest, type Store } from "./core.ts";

// Deployment substitutes only a SHA-256 verifier; no application bearer secret is committed.
const KEY_HASH = "__BOOKS_PREVIEW_GATEWAY_KEY_SHA256__";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const table = "qr_books_preview_requests";
const encode = (r: StoredRequest) => ({ id: r.id, submission_id: r.submissionId, fingerprint: r.fingerprint, attribution: r.attribution, books: r.books, country: r.country, city: r.city, status: r.status, created_at: r.createdAt, updated_at: r.updatedAt, shipped_at: r.shippedAt, delivered_at: r.deliveredAt, version: r.version });
const decode = (r: Record<string, unknown>): StoredRequest => ({ id: r.id, submissionId: r.submission_id, fingerprint: r.fingerprint, attribution: r.attribution, books: r.books, country: r.country, city: r.city, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at, shippedAt: r.shipped_at, deliveredAt: r.delivered_at, version: r.version }) as StoredRequest;
const store: Store = {
  async submit(row) {
    const inserted = await db.from(table).insert(encode(row)).select().single();
    if (!inserted.error) return decode(inserted.data);
    if (inserted.error.code !== "23505") throw new Error("Insert failed");
    const existing = await db.from(table).select().eq("submission_id", row.submissionId).maybeSingle();
    if (existing.error || !existing.data) throw new GatewayError(409, "Request identity conflict");
    if (existing.data.fingerprint !== row.fingerprint) throw new GatewayError(409, "Submission changed; start a new request");
    return decode(existing.data);
  },
  async list() {
    const rows: StoredRequest[] = [];
    let cursor: string | undefined;
    for (;;) {
      let query = db.from(table).select().order("id").limit(500);
      if (cursor) query = query.gt("id", cursor);
      const result = await query;
      if (result.error) throw new Error("Read failed");
      rows.push(...result.data.map(decode));
      if (rows.length > 10000) throw new GatewayError(503, "Preview record limit reached");
      if (result.data.length < 500) return rows;
      cursor = result.data[result.data.length - 1].id;
    }
  },
  async get(id) { const result = await db.from(table).select().eq("id", id).maybeSingle(); if (result.error) throw new Error("Read failed"); return result.data ? decode(result.data) : null; },
  async transition(before, after) { const result = await db.from(table).update(encode(after)).eq("id", before.id).eq("version", before.version).select().maybeSingle(); if (result.error) throw new Error("Update failed"); if (!result.data) throw new GatewayError(409, "Request changed; refresh and try again"); return decode(result.data); },
  async delete(id) { const result = await db.from(table).delete().eq("id", id); if (result.error) throw new Error("Delete failed"); },
};
Deno.serve(request => handle(request, { keyHash: KEY_HASH, store }));
