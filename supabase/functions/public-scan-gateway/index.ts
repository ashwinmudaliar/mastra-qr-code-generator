import { createClient } from "@supabase/supabase-js";
import { handlePublicScanGateway } from "./core.ts";

// Substitute only these fixed settings in the deployment bundle. Use both IDs
// for the ownership transfer, then owner mode with an empty workspace ID.
const KEY_HASH = "__PUBLIC_SCAN_GATEWAY_KEY_SHA256__";
const SCOPE_MODE = "__PUBLIC_SCAN_SCOPE_MODE__";
const WORKSPACE_ID = "__PUBLIC_SCAN_WORKSPACE_ID__";
const OWNER_ID = "__PUBLIC_SCAN_OWNER_ID__";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve((request: Request) => handlePublicScanGateway(request, {
  db, keyHash: KEY_HASH, scopeMode: SCOPE_MODE, workspaceId: WORKSPACE_ID, ownerId: OWNER_ID,
}));
