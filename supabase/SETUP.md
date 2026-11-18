# Supabase and Vercel setup

The current private preview uses one persistent Supabase workspace without a QR Studio account. Vercel access protection gates the app. Supabase Auth remains available for a later login rollout; signup, email confirmation, and Auth URL configuration are not prerequisites for private review.

## Private workspace

1. Apply the versioned migrations in `migrations/` to the intended Supabase project. They create isolated `qr_studio_*` tables, preserve account-owner RLS, and add private workspace ownership. Each code must have exactly one `owner_id` or `private_workspace_id`. Run `tests/rls.sql` and `tests/private-workspace-rls.sql` afterward; anonymous and ordinary authenticated Data API clients must not access private-workspace rows.
2. Provision one workspace and retain its generated ID across deployments. Bind that ID to the workspace gateway's deployed configuration. Do not create a hidden Auth user or a new workspace on each browser visit.
3. Configure these Vercel preview environment variables:

   | Variable | Purpose |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client-safe publishable key for the retained account path |
   | `QR_PRIVATE_PREVIEW=1` | Enables the hosted private workspace only in Vercel's preview environment at its generated deployment hostname |
   | `QR_WORKSPACE_GATEWAY_KEY` | Server-only random bearer for management of the fixed workspace |
   | `QR_SCAN_GATEWAY_KEY` | Separate server-only random bearer for scan resolution/recording |
   | `NEXT_PUBLIC_QR_SCAN_ORIGIN` | Optional permanent scan origin; omit during review to use the current browser origin |

   Generate independent keys with at least 256 bits of entropy. Never put a gateway key in a `NEXT_PUBLIC_` variable. Keep `QR_LOCAL_PREVIEW` unset on Vercel.
4. Deploy both gateways as described below. Preserve Vercel Authentication with All Deployments protection (`ssoProtection.deploymentType: "all"`), no protection exceptions, and no public aliases. Verify unsigned page, management API, and scan requests are blocked before sharing the generated preview URL.
5. Test the complete hosted flow through authorized Vercel access using a disposable code. Check persistence in a fresh browser session, then remove only the test data. A successful local test or build is not proof of hosted access.

The intended reviewer is one person, but Vercel-authorized members, granted users, and holders of an automation/shareable-link bypass can use this same workspace. Keep those access grants limited. Do not distribute a bypass token in the review URL. [Vercel protection](https://vercel.com/docs/deployment-protection) is the authentication boundary; the application's environment/hostname checks supplement it.

Protected QR links also require preview access. Before producing public event materials, choose a stable public scan origin and complete the separate release checks in [Maintenance](../docs/MAINTENANCE.md). Changing the configured origin cannot update an already printed QR code.

## Gateway deployment

Both functions keep Supabase's full-project server credential inside the Edge Function runtime. Vercel receives only the two scoped bearer keys. For each key, compute its SHA-256 digest and substitute the corresponding verifier placeholder in memory while deploying; never substitute or commit the raw key. Deploy the full function import set with `verify_jwt: false`, since each function performs its own bearer authentication before database access. Unsubstituted configuration fails closed. Neither endpoint sends CORS headers or accepts browser credentials as a substitute for its bearer.

### Workspace gateway

`workspace-gateway` supports code creation, reading, editing, archival, restoration and scan retrieval for one workspace. Its legacy `delete` operation archives so older preview clients cannot permanently remove history. Its deployed configuration fixes the workspace ID; callers cannot choose an owner, workspace, table, or arbitrary query. Its separate verifier must reject the scan key. Every database operation remains scoped to the configured workspace, including archive/restore IDs and scan joins. Input validation and body limits apply before processing supported operations.

Use `supabase/functions/workspace-gateway/index.ts` as the entrypoint and `supabase/functions/workspace-gateway/deno.json` as the import map. Preserve these repository-relative paths in the deployment bundle:

- `supabase/functions/workspace-gateway/index.ts`
- `supabase/functions/workspace-gateway/core.ts`
- `supabase/functions/workspace-gateway/store.ts`
- `supabase/functions/workspace-gateway/deno.json`
- `lib/server/validation.ts`
- `lib/qr-design.ts`

In the entrypoint content supplied for deployment, replace `__WORKSPACE_GATEWAY_KEY_SHA256__` with the management key's digest and `__PRIVATE_WORKSPACE_ID__` with the provisioned workspace UUID. Keep the placeholders in committed source. The shared validation/design files are required by the relative imports; deploying only the gateway directory is incomplete.

The gateway's service credential bypasses RLS, so those explicit filters are essential. Do not weaken anonymous/account policies to make the private app work. Retain the same workspace ID on redeployments so codes, normalized logos, and scan history persist.

### Scan gateway

`scan-gateway` resolves a single code by its random slug and optionally records a coarse visit. It cannot list or edit codes or read analytics. In `functions/scan-gateway/index.ts`, replace `__SCAN_GATEWAY_KEY_SHA256__` with the digest in memory and upload `index.ts`, `core.ts`, and `deno.json` together.

It bounds requests to 4 KB, validates metadata, honors archive/pause/expiry, and returns one destination plus bounded code/visit metadata when a visit was successfully recorded. Only the authenticated Next.js server receives this metadata and can sign the optional Books reference. A scan-storage error is logged without request payload data and does not interrupt a valid redirect. It records UTC time, approximate Vercel country/region/city, and device category, without retaining raw IP addresses or full user agents. Known crawlers, prefetches, and HEAD requests are excluded; counts are link visits.

### Books preview gateway

`books-preview-gateway` stores only isolated test requests in `qr_books_preview_requests`, created by `20261118181555_books_preview_requests.sql` in the QR Studio project. Deploy its `index.ts`, `core.ts`, and `deno.json` with the explicit repository-relative entrypoint/import-map paths. Replace `__BOOKS_PREVIEW_GATEWAY_KEY_SHA256__` in memory with a fresh independent key's SHA-256 digest. It authenticates that bearer before every operation; `verify_jwt: false` relies on this explicit check. No browser grants or policies are added. Run `tests/books-preview-rls.sql` and the gateway tests after changes.

The private Books project receives only this scoped gateway credential, plus its signing/reporting secrets; no production Books database/provider credentials. See [Books attribution](../docs/FULFILLMENT.md) for the full contract and production release boundary.

Rotate a compromised bearer by replacing its deployed verifier and Vercel variable in the same maintenance window, then verify that gateway's flow. Keep the two credentials independent. `supabase/functions/**` is excluded from the Next.js TypeScript project; its Deno imports are pinned and its platform-neutral logic is tested through Node.

## Local review and later login

`QR_LOCAL_PREVIEW=1` remains a development-server + loopback-only file store and reviewer identity. It stores ignored `.data/qr-studio.json` and never activates in a production build. This is independent of the hosted private workspace and has no estimated geography.

When account login is requested, configure Supabase Auth's Site URL, exact callback allowlist, and email delivery; optionally set `QR_ADMIN_EMAILS`. Verify the intended user's account, then follow [the ownership transfer](../docs/MAINTENANCE.md#adding-account-login-later). Move the workspace's codes to that owner without recreating IDs/slugs/scans, disable the private flag, and retire the workspace gateway credential. The scan gateway continues independently.

An optional direct scan path accepts `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY`; leave these unset on Vercel when using the preferred scoped scan gateway.
