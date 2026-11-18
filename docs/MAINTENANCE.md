# Build and maintenance

## Local work

Use the committed lockfile with `npm ci`. Resolve the workspace path before creating a checkout, installing dependencies, or building. On the author's Mac, source and generated development data belong under `~/Developer`, never physically under iCloud-synced Desktop/Documents.

`.env.local`, `.vercel/`, `.data/`, dependencies, build output, screenshots under `outputs/`, and test credentials are untracked. The repository is public. Review the exact staged files for credentials and private test data before every push.

Read the installed framework documentation in `node_modules/next/dist/docs/` when changing Next.js behavior. Pin dependency changes and include the lockfile. If npm reports an unavailable transitive version despite the package being published, refresh registry metadata rather than successively guessing dependency versions.

## Verification

Run `npm run typecheck`, `npm test`, and `npm run build` for changes that affect application behavior. Run focused tests first during iteration. The test suite covers URL/UTM validation, ownership assumptions, visit classification, aggregation, QR decoding, logo sanitization, quiet zones, and gateway authentication.

Run `scripts/verify-backend.mjs` against a loopback development server with `QR_LOCAL_PREVIEW=1` after changing the HTTP flows. It rejects nonlocal targets, creates only its own test code, and archives it afterward. For visual changes, run the browser check with the local server active (`npx playwright install chromium --only-shell`, then `node scripts/audit-ui.mjs`) and perform the screen/state review in [Design](DESIGN.md). The browser script writes ignored screenshots/downloads under `outputs/design-audit/` and archives its temporary code. Screenshots alone do not establish that save, redirect, or export works. For mobile typography or spacing changes, run `node scripts/audit-mobile.mjs` with the local server active. It creates and archives one temporary local code, checks 320/360/390/430px views for text below 12px, enabled controls shorter than 44px, and page overflow, and captures sign-in/signup using a browser-only session response without submitting account requests. Inspect the generated screenshots; these size checks do not replace contrast, keyboard, or real-device review.

Run `tests/rls.sql`, `tests/private-workspace-rls.sql`, and `tests/archive-rls.sql` against the intended Supabase test project after schema/policy changes. They verify anonymous denial, owner isolation, and private-workspace boundaries and roll back fixtures. Follow with Supabase security advisors. Never repurpose a real customer's record as a fixture.

The advisor's informational [`rls_enabled_no_policy`](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) finding on `qr_studio_workspaces` is expected: RLS is enabled, no browser grants or policies exist, and only the server credential accesses it. Do not add a permissive policy or disable RLS to suppress that notice.

For the complete saved-code workflow, run `node scripts/verify-e2e.mjs` against the loopback reviewer server. It uploads a real PNG made from the existing Mastra asset through the file picker, saves and reloads the code, downloads PNG/SVG/PDF, edits its destination, and verifies the original link, campaign tags, two recorded visits, and desktop/mobile reports. Its temporary record is archived and its exact ID recorded for operator cleanup. Neither mode creates or uses an app account.

For the hosted private workspace, pass `--private-preview` and the exact generated deployment URL. Supply an authorized automation credential through the `QR_TEST_PREVIEW_BYPASS` environment variable, never in the URL or source. With that secret loaded and `QR_TEST_PREVIEW_URL` set to the intended deployment, run `node scripts/verify-e2e.mjs --private-preview "$QR_TEST_PREVIEW_URL"`. It refuses other project hosts and non-private sessions, scopes the browser protection cookie to that host, and refuses to forward the credential to another origin. Outputs go to ignored `outputs/private-preview/`.

Then run `node scripts/verify-export-artifacts.mjs` for local downloads, or `node scripts/verify-export-artifacts.mjs outputs/private-preview/expected.json` for hosted downloads. This requires Poppler's `pdfinfo` and `pdftoppm` in addition to the locked Node dependencies. It checks the uploaded logo embedded in the SVG, renders the PDF at 300 dpi, and decodes all three formats to the same expected link. Inspect `verification-comparison.png` in the corresponding output directory for logo, frame, caption, and margins. These are disposable review exports, not event-ready materials.

Run `node scripts/verify-editor-state.mjs` after changing editor state or asynchronous actions. Its isolated browser responses exercise delayed saves, upload processing, failed-save recovery, retained pause status, and analytics refresh without creating database fixtures or changing account settings.

For fulfillment layout/error/filter regression coverage, run `QR_UI_TEST_URL=http://127.0.0.1:3147 node scripts/verify-fulfillment-ui.mjs` with a loopback development server. It supplies browser fixtures only and checks six widths, historical labels, preserved matching results on outages, and unreadable/overflowing controls. It does not prove the hosted Books integration.

Local checks do not establish hosted private access. After changing the private workspace, verify that unauthenticated requests to the page, session, codes, analytics, and scan routes are blocked by Vercel. Through authorized preview access, use a temporary code to check create/upload/save/reopen, every export format, destination changes, and an actual recorded visit. Confirm persistence in a fresh browser session and remove only the test fixture. Check that an unauthenticated workspace-gateway request fails and that ordinary Data API roles cannot read or modify private-workspace rows.

## Archival and fixture cleanup

`20261118193807_archive_qr_codes.sql` adds nullable archive timestamps, requires archived codes to stay paused, and removes browser-role DELETE/TRUNCATE access. Apply it before deploying the updated workspace/scan gateways and application. The legacy gateway `delete` operation now archives, protecting history when an older private preview sends a Delete request. Apply this migration only to the QR Studio project; Books needs no change for archival.

All application code lists retain archived identities so historical scan and fulfillment filters continue to work. The default library hides them; its Archived filter exposes Restore and View analytics. Restore keeps the code ID/slug and returns it paused. Ordinary edits must reject archived codes, including requests from stale editors. Verify that archiving preserves one attributed request/four shipped books, blocks new visits, and restores without changing identity.

Browser/HTTP verifiers cannot permanently delete codes. They archive their synthetic code and write its exact ID to an ignored per-code `fixture-cleanup-<id>.json` manifest. An operator may purge only those exact created fixtures after checking the manifest's origin and record identity; never delete by a broad name prefix or archive status. Hosted cleanup uses the QR Studio project's privileged operator access. Local-file cleanup requires stopping the owned server first, since editing its file while the process holds a cached store can resurrect records. Do not add an application purge endpoint or grant browser DELETE access for tests.

## Schema changes

Use the Supabase project's migration workflow. Inspect existing schema first; create a new migration, do not edit one already applied. Keep RLS on all QR Studio tables and test SELECT/INSERT/UPDATE/DELETE paths. A code must have exactly one account owner or private workspace. Existing owner policies must not expose workspace rows, and gateway queries must always include their fixed workspace filter. Anonymous access to tables remains denied; client-side filtering is not authorization. Update contracts and repository conversions with the migration.

The initial migration is `supabase/migrations/20261117172014_qr_studio_initial.sql`. Deployment does not automatically run arbitrary new SQL from this repository; apply and verify migrations deliberately before publishing dependent code.

`20261118181555_books_preview_requests.sql` belongs only to the QR Studio project. It creates isolated synthetic Books requests without recipient/contact/street fields. `tests/books-preview-rls.sql` verifies browser-role denial. The informational no-policy advisor on this table is intentional, like `qr_studio_workspaces`. The separately authenticated `books-preview-gateway` is the only application writer. Do not apply this migration to the production Books project.

## Private Books integration

See [the wire contract](FULFILLMENT.md). Keep Books in the separate protected `mastrabooks-qr-preview` Vercel project with no production database, shipping, CRM, Sheets, email, or SMS credentials. All deployments require Vercel authentication. The Books source branch's production migration remains unapplied and its capture flag stays disabled outside preview.

Configure the Books gateway, signing, and reporting keys independently. QR Studio receives the reporting key and the Books automation bypass only on its server. Never put bypasses into links or browser bundles. Report requests use an exact configured origin, reject redirects, and scope code IDs to the active workspace. When replacing the Books deployment, update both QR_BOOKS_PREVIEW_ORIGIN and QR_BOOKS_REPORT_URL, then redeploy QR Studio. Old deployments retain environment values; revoke obsolete integration credentials when retiring them.

Validate an actual hosted QR→Books submission→simulated shipped/delivered→QR Analytics flow, transport replay, invalid signatures, direct unattributed requests, access denial, and exact fixture cleanup. No production test order is required or authorized by this preview workflow. Account setup remains deferred.

`node scripts/verify-books-attribution.mjs` performs that connected check. Supply the exact generated deployment origins through `QR_TEST_PREVIEW_URL` and `BOOKS_TEST_PREVIEW_URL`, and their separate automation credentials through `QR_TEST_PREVIEW_BYPASS` and `BOOKS_TEST_PREVIEW_BYPASS`. It refuses other hosts, scopes cookies/headers to the intended origin, uses fictional details, removes exact simulated Books requests and archives its QR fixture even after a failure, and writes ignored screenshots plus `outputs/books-attribution/workflow-report.json`. Never pass credentials in a URL. Its browser suppresses the optional Vercel feedback toolbar, which is unrelated to fulfillment.

## Deployment

The current stack is Vercel + Supabase. Studio deployments remain manual, protected previews with Git integration disconnected. Public scanning deploys separately from `scanner/` to `mastra-qr-scanner`; do not deploy the complete Studio publicly. The account-free workspace requires `QR_PRIVATE_PREVIEW=1` and a server-only `QR_WORKSPACE_GATEWAY_KEY`, both scoped to the Vercel preview environment. It uses durable Supabase storage; `QR_LOCAL_PREVIEW` must not be deployed. See [Supabase setup](../supabase/SETUP.md) for gateway configuration.

Keep Vercel Authentication set to All Deployments (`ssoProtection.deploymentType: "all"`) on the Studio project while private mode is enabled. Verify the actual preview target, status, generated hostname, absence of public aliases/exceptions, and unauthenticated page/API behavior before sharing the URL. Do not assume a deployment command selected the intended target. Protection is the login boundary: anyone authorized by Vercel or holding a bypass can use the same workspace. Do not distribute a bypass/shareable link as the review URL. Connect Git only when its settings preserve these boundaries; do not publish main as a side effect of repository setup.

For each gateway, deploy its full import set with the appropriate key's SHA-256 verifier substituted in memory. The workspace and public scan gateways bind the same provisioned workspace ID in deployed configuration. Keep private-scan, public-scan, and workspace keys independent; include every credential in secret scans. Never commit either bearer or a service-role key. `verify_jwt: false` is intentional because the functions authenticate their scoped bearer before touching the database. Do not remove those checks or enable anonymous table access as a shortcut.

After verifying the public scanner, set both `NEXT_PUBLIC_QR_SCAN_ORIGIN` and the server-only `QR_PUBLIC_SCAN_ORIGIN` to `https://qr.mastrabooks.dev` on Studio. Matching values confirm public-link mode and disable Books preview rewriting/reporting on that Studio deployment. A mismatch must not silently advertise public readiness. Set the permanent origin before producing event materials. It is a build-time browser setting; rebuild after changing it. Without that setting, the editor derives tracking URLs from its current browser origin, so preview exports contain preview URLs. Adding or changing a domain later cannot change printed URL contents. Verify the URL decoded from an actual export, not just the environment setting.

## Public scanner deployment

Deploy only `scanner/`, linked to its own `mastra-qr-scanner` project. Its server configuration contains the Supabase project URL (`SUPABASE_URL`) and `QR_PUBLIC_SCAN_GATEWAY_KEY`; the new `public-scan-gateway` uses that key’s verifier and a fixed workspace filter. Do not install workspace, full-project database, Books, bypass, or local-preview credentials in this project. Keep the existing private gateways and Studio protection unchanged. See [scanner setup](../scanner/README.md) and [gateway setup](../supabase/SETUP.md#public-scan-gateway).

Attach only the selected scan subdomain, `qr.mastrabooks.dev`. The public origin must work without Vercel authentication; generated scanner previews may remain protected. Never add the public domain to Studio or remove Studio protection. Record the scanner deployment ID, source commit, domain/protection settings, and verified HTTP results before updating Studio’s export origin.

Configure a distributed Vercel WAF fixed-window limit before public campaigns. The initial planned threshold is 600 requests per minute per IP, allowing for shared conference Wi-Fi; verify the deployed value and adjust using observed traffic. Test 429 behavior without writing scan fixtures by using a nonexistent slug. Scope the rule to this scanner project, and inspect the complete draft before publishing firewall changes. Monitor rejected requests alongside redirect/gateway errors.

## Adding account login later

Keep account setup deferred until requested. When introducing it, configure Auth URLs/email and verify the intended user's session first. Resolve that user's ID and the existing workspace ID from the intended project; never copy an example or test ID into a migration.

Transfer the workspace's codes in one database transaction by setting `owner_id` to that user and clearing `private_workspace_id` together. Check the affected record count; preserve every code ID, slug, design, and scan row. Existing owner RLS then grants the user access through the same code references. Verify their library and analytics before retiring private mode.

Disable `QR_PRIVATE_PREVIEW`, remove `QR_WORKSPACE_GATEWAY_KEY` from Vercel configuration, and redeploy the account path. Revoke the workspace gateway's verifier or retire that function as well: old preview deployments retain their environment values, so removing a variable alone does not revoke their credential. Keep scan resolution and Vercel protection working throughout the transition. If public scanning is active, update its gateway ownership scope in the same release so transferring codes away from the private workspace does not break printed links. Test the permanent scan origin before retiring the old ownership path.

## Public launch checks

- Confirm ownership/TLS for `qr.mastrabooks.dev` and keep the domain renewed while print materials circulate.
- Verify the public scanner has only scan credentials, its gateway rejects unknown credentials and other-workspace slugs, and management/auth/report paths return 404. Unsupported methods must return 405 without lookup or recording.
- Recheck that the Studio page, session, codes, analytics, fulfillment, and its own scan routes remain blocked without Vercel access. App account setup remains deferred; public scanning does not require transferring workspace ownership.
- Decode actual PNG/SVG/PDF and sticker-sheet exports to the permanent public origin. Scan an export from a signed-out phone using mobile data; verify the saved destination, campaign tags and one recorded visit. Check destination edits preserve the slug, pause/expiry/archive return 410, malformed/unknown/draft links return 404, and HEAD/prefetch/bots create no visits.
- Verify a scan-recording failure still redirects, a lookup outage returns 503, and redirects remain uncached. Confirm the scanner does not rewrite Books URLs or add preview attribution. Do not submit a real Books order as a scanner check.
- Verify the deployed firewall rule and 429 behavior. Record monitoring ownership for redirect failures, gateway recording errors, rate-limit traffic, and database growth. Select a scan-retention policy; the app does not automatically delete old scans.
- Use exact synthetic fixture IDs for cleanup and report any residual fixtures. Review live UI wording: the dashboard is private, scan links are public, and live fulfillment reporting is not connected.

Account login and real Books fulfillment reporting have separate release paths. These instructions and private-review results are not evidence that the public launch checks have passed.

## Failure and rollback

If a new deployment breaks redirect behavior, roll the Vercel app back to the last verified version without changing the domain or slugs. Applied database migrations need a compatible forward fix; avoid destructive rollback of scan history. If a gateway key leaks, rotate that Vercel key and its Supabase verifier together and verify the corresponding flow. Keep the other gateway's credential independent. Do not print secrets in logs while diagnosing failures.

Reports currently aggregate fetched scan rows in the application. At higher volume, move aggregations into owner-scoped database queries and retain the same metric definitions. Add conversion tracking only with an explicit fulfillment-site contract; a redirect alone cannot confirm a book order.
