# Supabase and Vercel setup

The Google-login path is for one creator at the standard Vercel dashboard address. Older account-free previews use a persistent workspace behind Vercel protection. These are separate access modes; deploying this source does not configure Google or Supabase Auth automatically.

## Google login

Use a dedicated Google Cloud OAuth web client for QR Studio. Follow [Supabase's Google provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and keep the Books OAuth client unchanged. Use the Mastra organization's Internal audience where available and only basic identity scopes (`openid`, email and profile); the application's exact email check is what limits dashboard access to `ashwin@mastra.ai`.

| Setting | Value |
| --- | --- |
| Google authorized JavaScript origin | `https://mastra-qr-studio.vercel.app` |
| Google authorized redirect URI | `https://ltoyhqrorttppcitdwii.supabase.co/auth/v1/callback` |
| Supabase Auth Site URL | `https://mastra-qr-studio.vercel.app` |
| Supabase Auth redirect allowlist | `https://mastra-qr-studio.vercel.app/auth/callback` |

Enable the Google provider with its client ID and client secret in Supabase Auth. Keep the secret in that provider configuration, never source, screenshots, URLs or browser environment variables. Do not use wildcard callback URLs, enable unrelated scopes, or configure email delivery for this Google-only flow.

After Ashwin's first verified Google sign-in creates the intended Auth user, turn off **Allow new users to sign up** and disable the **Email** provider in Supabase, leaving Google enabled. Confirm the saved settings and that the existing account can sign in again while new-user signup is denied. [Supabase's signup setting](https://supabase.com/docs/guides/auth/general-configuration) allows existing users to continue signing in; close signup only after the intended user exists. Keep the application's exact-email check as an independent restriction.

Configure Studio's production environment:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | QR Studio's Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client-safe publishable key; never a service-role key |
| `QR_GOOGLE_LOGIN=1` | Enables the Google-only path |
| `QR_ADMIN_EMAILS=ashwin@mastra.ai` | Required exact-email allowlist, checked on every management request |
| `QR_STUDIO_ORIGIN=https://mastra-qr-studio.vercel.app` | Required fixed HTTPS root for OAuth and same-origin checks |
| `NEXT_PUBLIC_QR_SCAN_ORIGIN=https://qr.mastrabooks.dev` | Existing build-time public scan origin |
| `QR_PUBLIC_SCAN_ORIGIN=https://qr.mastrabooks.dev` | Matching server confirmation of public-link mode |

Keep production limited to the seven variables above. Omit `QR_PRIVATE_PREVIEW`, `QR_LOCAL_PREVIEW`, `QR_WORKSPACE_GATEWAY_KEY`, `QR_SCAN_GATEWAY_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and all Books preview credentials. The Studio's legacy `/q/<slug>` handler is not guarded by app login; absent scan/database credentials make it fail closed, while public scanning stays on the separate scanner. Verify that boundary after deployment. Older Vercel-protected previews can retain their private scan key for isolated checks. Google mode rejects private/local flags or missing/invalid auth configuration. It validates a confirmed Supabase email and server-established Google identity; editable profile metadata cannot grant access. Password/signup endpoints are disabled. Keep the existing owner RLS policies.

Follow [the ordered rollout](../docs/MAINTENANCE.md#google-login-rollout): verify the real Google session while Studio is still Vercel-protected, transfer the existing workspace without changing code identities, restrict the public gateway to the owner, revoke the old management bearer, then verify the standard alias under app authentication. Generated URLs and previews remain Vercel-protected. Record actual deployment evidence separately from these setup instructions.

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
   | `NEXT_PUBLIC_QR_SCAN_ORIGIN` | Build-time public export origin; set to `https://qr.mastrabooks.dev` only after scanner verification, otherwise omit for private preview |
   | `QR_PUBLIC_SCAN_ORIGIN` | Matching server-only origin that confirms public-link mode and disables simulated Books redirects/reporting |

   Generate independent keys with at least 256 bits of entropy. Never put a gateway key in a `NEXT_PUBLIC_` variable. Keep `QR_LOCAL_PREVIEW` unset on Vercel.
4. Deploy the workspace and private scan gateways as described below. On Studio, preserve Vercel Authentication with All Deployments protection (`ssoProtection.deploymentType: "all"`), no protection exceptions, and no public aliases. Verify unsigned page, management API, and scan requests are blocked before sharing the generated preview URL.
5. Test the complete hosted flow through authorized Vercel access using a disposable code. Check persistence in a fresh browser session, then remove only the test data. A successful local test or build is not proof of hosted access.

The intended reviewer is one person, but Vercel-authorized members, granted users, and holders of an automation/shareable-link bypass can use this same workspace. Keep those access grants limited. Do not distribute a bypass token in the review URL. [Vercel protection](https://vercel.com/docs/deployment-protection) is the authentication boundary; the application's environment/hostname checks supplement it.

Protected preview QR links also require preview access. For this older account-free mode, the separate public scanner serves the permanent origin while Studio stays Vercel-protected. Before producing event materials, complete the [public launch checks](../docs/MAINTENANCE.md#public-launch-checks) and verify decoded exports use the public origin. Changing configuration cannot update an already printed QR code.

## Gateway deployment

Every gateway keeps Supabase's full-project server credential inside the Edge Function runtime. Each Vercel project receives only the scoped bearers needed by its routes. For each key, compute its SHA-256 digest and substitute the corresponding verifier placeholder in memory while deploying; never substitute or commit the raw key. Deploy the full function import set with `verify_jwt: false`, since each function performs its own bearer authentication before database access. Unsubstituted configuration fails closed. The gateways do not send CORS headers or accept browser credentials as a substitute for their bearers.

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

### Public scan gateway

`public-scan-gateway` is independent of the original private scan gateway. It reuses scan validation/availability/recording logic, but limits every lookup to an ownership scope fixed in its deployment. Deploy the complete import set under `functions/public-scan-gateway/` and referenced shared scan files. Substitute these placeholders in memory, retaining placeholders in committed source:

| Placeholder | Value |
| --- | --- |
| `__PUBLIC_SCAN_GATEWAY_KEY_SHA256__` | Existing public scan bearer's SHA-256 digest; keep it unchanged during ownership transfer |
| `__PUBLIC_SCAN_SCOPE_MODE__` | `workspace`, `transition` or `owner` |
| `__PUBLIC_SCAN_WORKSPACE_ID__` | Exact workspace UUID for workspace/transition mode; empty string for owner mode |
| `__PUBLIC_SCAN_OWNER_ID__` | Exact verified Auth user UUID for transition/owner mode; empty string for workspace mode |

Workspace mode requires the fixed workspace and a null owner. Transition mode accepts either that exact workspace with a null owner, or that exact owner with a null workspace. Owner mode requires the fixed owner and a null workspace. Invalid or unsubstituted configuration fails closed, including a nonempty unused ID. Callers cannot supply any scope.

Deploy transition mode before moving codes, then owner mode after the atomic transfer. Verify existing links at both stages. Do not leave the gateway bound only to the old workspace after the transfer.

For the first installation, generate an independent bearer. Keep that bearer for scope-only updates. Configure only these database-related values in the separate `mastra-qr-scanner` Vercel project:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Exact HTTPS Supabase project origin |
| `QR_PUBLIC_SCAN_GATEWAY_KEY` | Server-only bearer for `public-scan-gateway` |

Never install `QR_WORKSPACE_GATEWAY_KEY`, the private scan key, full-project database keys, Books secrets, or protection bypasses in the scanner. The gateway cannot list/edit codes or read reports, and the scanner does not expose gateway attribution metadata to visitors. Confirm out-of-scope workspace/owner lookup denial, bearer isolation, and ordinary Data API denial before releasing the public hostname. This adds no browser grants or schema changes.

Public scanning forwards to existing destinations without Books attribution signing or preview-origin rewriting. Google-login Studio uses its verified owner's session and RLS for management and analytics; older account-free previews used the fixed workspace gateway. Retire that old management credential after transfer.

### Books preview gateway

`books-preview-gateway` stores only isolated test requests in `qr_books_preview_requests`, created by `20261118181555_books_preview_requests.sql` in the QR Studio project. Deploy its `index.ts`, `core.ts`, and `deno.json` with the explicit repository-relative entrypoint/import-map paths. Replace `__BOOKS_PREVIEW_GATEWAY_KEY_SHA256__` in memory with a fresh independent key's SHA-256 digest. It authenticates that bearer before every operation; `verify_jwt: false` relies on this explicit check. No browser grants or policies are added. Run `tests/books-preview-rls.sql` and the gateway tests after changes.

The private Books project receives only this scoped gateway credential, plus its signing/reporting secrets; no production Books database/provider credentials. See [Books attribution](../docs/FULFILLMENT.md) for the full contract and production release boundary.

Rotate a compromised bearer by replacing its deployed verifier and Vercel variable in the same maintenance window, then verify that gateway's flow. Keep all gateway credentials independent. `supabase/functions/**` is excluded from the Next.js TypeScript project; its Deno imports are pinned and its platform-neutral logic is tested through Node.

## Local review

`QR_LOCAL_PREVIEW=1` remains a development-server + loopback-only file store and reviewer identity. It stores ignored `.data/qr-studio.json` and never activates in a production build. This is independent of the hosted private workspace and has no estimated geography.

An optional direct scan path accepts `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY`; leave these unset on Vercel when using the preferred scoped scan gateway.
