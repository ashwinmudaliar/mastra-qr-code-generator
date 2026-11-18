import { createClient } from "@supabase/supabase-js";
import { handlePublicScanGateway } from "./core.ts";

// Substitute only the verifier and fixed workspace in the deployment bundle.
const KEY_HASH = "__PUBLIC_SCAN_GATEWAY_KEY_SHA256__";
const WORKSPACE_ID = "__PUBLIC_SCAN_WORKSPACE_ID__";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve((request: Request) => handlePublicScanGateway(request, { db, keyHash: KEY_HASH, workspaceId: WORKSPACE_ID }));
