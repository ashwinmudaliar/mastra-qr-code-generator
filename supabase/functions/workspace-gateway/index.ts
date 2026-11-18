import { createClient } from "@supabase/supabase-js";
import { handleWorkspaceGateway } from "./core.ts";
import { createWorkspaceStore } from "./store.ts";

// Substitute the high-entropy key's SHA-256 verifier and fixed workspace UUID
// in memory at deployment. Never put the bearer key in source or browser code.
const KEY_HASH = "__WORKSPACE_GATEWAY_KEY_SHA256__";
const WORKSPACE_ID = "__PRIVATE_WORKSPACE_ID__";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const store = createWorkspaceStore(db);
Deno.serve((request: Request) => handleWorkspaceGateway(request, {
  keyHash: KEY_HASH,
  workspaceId: WORKSPACE_ID,
  store,
  onError() { console.error("QR Studio workspace request failed"); },
}));
