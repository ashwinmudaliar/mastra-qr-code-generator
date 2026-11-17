# Supabase and Vercel setup

This app uses Next.js on Vercel and Supabase Auth/Postgres. Its two `qr_studio_*` tables are isolated from other applications.

1. Apply `migrations/20261117172014_qr_studio_initial.sql` to the intended Supabase project. It enables owner-based row security. Run `tests/rls.sql` afterward to verify that accounts cannot read or update one another’s codes, cannot forge scan records through the Data API, and anonymous users cannot read data. The test rolls back all its fixtures.
2. Set these Vercel environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`: the project URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the publishable API key.
   - `QR_SCAN_GATEWAY_KEY`: a random, server-only bearer key with at least 256 bits of entropy. The authenticated gateway described below uses it for the two narrowly scoped scan operations.
   - Alternatively, `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) enables the direct database path. Prefer the gateway so a full-project secret does not leave Supabase.
   - Optional `NEXT_PUBLIC_QR_SCAN_ORIGIN`: the permanent origin used in exported links; without it, exports use the browser origin. Rebuild after changing it.
   - Optional `QR_ADMIN_EMAILS`: comma-separated sign-in/sign-up allowlist. Row security still protects every owner’s data.
3. Configure Supabase Auth’s Site URL and redirect allowlist to include the Vercel review URL and `/auth/callback`. Use exact URLs for production. Confirm the first account’s email before signing in.
4. Keep Vercel Deployment Protection enabled during private review. Protected previews require Vercel access even on `/q/...` and are not suitable for distributing to event attendees.
5. Before printing codes for public use, choose a stable public origin and make only the scan endpoint publicly reachable. The dashboard APIs always require Supabase authentication; every data query is owner-scoped. The editor uses `NEXT_PUBLIC_QR_SCAN_ORIGIN` when configured, otherwise the browser origin when exporting. Changing the origin later cannot update existing printed codes.

The scan endpoint records UTC timestamp, code, approximate country/region/city from Vercel’s request metadata, and coarse device category. It retains no raw IP address or full user-agent string. Known crawlers, prefetches, and HEAD requests are excluded; counts are visits, not a guarantee of unique people or camera scans. Local review has no geolocation estimate.

`QR_LOCAL_PREVIEW=1` enables a local development-only file store and reviewer identity for loopback requests. It never activates in a production build, even if the variable is set. Its `.data/` directory must stay untracked. Never rely on local preview data for an event.

## Authenticated scan gateway

The `scan-gateway` Edge Function resolves a single code by its unguessable slug and optionally records a coarse scan event. It cannot list codes, change destinations, read analytics, or operate on arbitrary tables. Supabase's built-in server credential stays inside the Edge Function runtime.

Generate a cryptographically random 32-byte bearer key and save it only as Vercel's server-side `QR_SCAN_GATEWAY_KEY`. Compute the key's SHA-256 hex digest. In memory during deployment, replace the single `__SCAN_GATEWAY_KEY_SHA256__` placeholder in `functions/scan-gateway/index.ts` with that digest; never replace it with the key itself. Upload `index.ts`, `core.ts`, and `deno.json` together. Deploy with `verify_jwt: false` because the function implements its own bearer authentication; it fails closed while the placeholder remains unsubstituted. The endpoint sends no CORS headers and is only called by the Vercel server. Never put this key in a `NEXT_PUBLIC_` variable.

The function rejects unknown keys before accessing the database, bounds request bodies to 4 KB, validates metadata, honors pause/expiry, and returns only the destination for a single code. A scan storage error is logged without payload data and does not interrupt the visitor's redirect. Rotate by redeploying with a new digest and updating Vercel's key in the same maintenance window.

Exclude `supabase/functions/**` from the Next.js TypeScript project; its entrypoint uses Deno and a pinned import map. `tests/scan-gateway.test.ts` exercises the platform-neutral core through Node.
