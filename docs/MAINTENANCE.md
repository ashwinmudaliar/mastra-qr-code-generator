# Build and maintenance

## Local work

Use the committed lockfile with `npm ci`. Resolve the workspace path before creating a checkout, installing dependencies, or building. On the author's Mac, source and generated development data belong under `~/Developer`, never physically under iCloud-synced Desktop/Documents.

`.env.local`, `.vercel/`, `.data/`, dependencies, build output, screenshots under `outputs/`, and test credentials are untracked. The repository is public. Review the exact staged files for credentials and private test data before every push.

Read the installed framework documentation in `node_modules/next/dist/docs/` when changing Next.js behavior. Pin dependency changes and include the lockfile. If npm reports an unavailable transitive version despite the package being published, refresh registry metadata rather than successively guessing dependency versions.

## Verification

Run `npm run typecheck`, `npm test`, and `npm run build` for changes that affect application behavior. Run focused tests first during iteration. The test suite covers URL/UTM validation, ownership assumptions, visit classification, aggregation, QR decoding, logo sanitization, quiet zones, and gateway authentication.

Run `scripts/verify-backend.mjs` against a loopback development server with `QR_LOCAL_PREVIEW=1` after changing the HTTP flows. It rejects nonlocal targets, creates only its own test code, and removes it afterward. For visual changes, run the browser check with the local server active (`npx playwright install chromium --only-shell`, then `node scripts/audit-ui.mjs`) and perform the screen/state review in [Design](DESIGN.md). The browser script writes ignored screenshots/downloads under `outputs/design-audit/` and removes its temporary code. Screenshots alone do not establish that save, redirect, or export works. For mobile typography or spacing changes, run `node scripts/audit-mobile.mjs` with the local server active. It creates and removes one temporary local code, checks 320/360/390/430px views for text below 12px, enabled controls shorter than 44px, and page overflow, and captures sign-in/signup using a browser-only session response without submitting account requests. Inspect the generated screenshots; these size checks do not replace contrast, keyboard, or real-device review.

Run `tests/rls.sql` against the intended Supabase test project after schema/policy changes. It verifies anonymous denial and cross-owner isolation and rolls back fixtures. Follow with Supabase security advisors. Never repurpose a real customer's record as a fixture.

For the complete saved-code workflow, run `node scripts/verify-e2e.mjs` against the loopback reviewer server. It uploads a real PNG made from the existing Mastra asset through the file picker, saves and reloads the code, downloads PNG/SVG/PDF, edits its destination, and verifies the original link, campaign tags, two recorded visits, and desktop/mobile reports. Only its temporary record is deleted. The script refuses to use a hosted account; account configuration and email delivery are outside this check.

Then run `node scripts/verify-export-artifacts.mjs` to independently render and decode the actual files from that run. This requires Poppler's `pdfinfo` and `pdftoppm` on the local machine in addition to the locked Node dependencies. It checks the uploaded logo embedded in the SVG, renders the PDF at 300 dpi, and decodes all three formats to the same expected tracking URL. Inspect `outputs/end-to-end/verification-comparison.png` for logo, frame, caption, and margin consistency. These artifacts are disposable local-review exports, not event-ready materials.

Run `node scripts/verify-editor-state.mjs` after changing editor state or asynchronous actions. Its isolated browser responses exercise delayed saves, upload processing, failed-save recovery, retained pause status, and analytics refresh without creating database fixtures or changing account settings.

## Schema changes

Use the Supabase project's migration workflow. Inspect existing schema first; create a new migration, do not edit one already applied. Keep owner RLS on both tables and test SELECT/INSERT/UPDATE/DELETE paths. Anonymous access to tables must remain denied; client-side filtering is not authorization. Update contracts and repository conversions with the migration.

The initial migration is `supabase/migrations/20261117172014_qr_studio_initial.sql`. Deployment does not automatically run arbitrary new SQL from this repository; apply and verify migrations deliberately before publishing dependent code.

## Deployment

The current stack is Vercel + Supabase; no Sites/Cloudflare hosting scaffold is used. Vercel Git integration is not connected during private review; future deployments are manual, protected previews until public launch is explicitly approved. See [Supabase setup](../supabase/SETUP.md) for the environment variables, auth callback settings, and scoped Edge Function deployment.

Publish a Vercel preview for review and preserve Deployment Protection. Verify the deployment’s actual target, status, URL, and unauthenticated behavior before sharing it; do not assume a preview command selected the intended target, especially when a project has no production deployment. Review aliases as well as the deployment itself. Then test account access and the actual scan path using disposable fixtures. Connect Git only when its branch and production settings preserve private review; do not publish main as a side effect of repository setup. Keep the same Supabase project unless a move is explicitly intended.

For the scan gateway, deploy all three function files together with the key's SHA-256 verifier substituted in memory. Never commit the bearer key or a service-role key. `verify_jwt: false` is intentional only because the function performs its own bearer authentication before touching the database. Do not remove that check or enable anonymous direct table writes as a shortcut.

Set `NEXT_PUBLIC_QR_SCAN_ORIGIN` to the permanent public scan origin before producing event materials. It is a build-time browser setting; rebuild after changing it. Without that setting, the editor derives tracking URLs from its current browser origin, so preview exports contain preview URLs. Adding or changing a domain later cannot change printed URL contents. Verify the URL decoded from an actual export, not just the environment setting.

## Public launch checks

- Choose the permanent scan origin, confirm its ownership, and keep it renewed while print materials circulate.
- Make scan links accessible to anonymous attendees while preserving Supabase authorization for management APIs.
- Configure Supabase Auth Site URL, redirect allowlist, and email delivery for the final app origin. Verify signup, confirmation, sign-in, sign-out, and expired sessions.
- Scan an exported image from a signed-out phone using mobile data. Verify the destination and one recorded visit; test pause, expiry, destination edits, and HEAD exclusions.
- Decide whether studio signup should be allowlisted, and configure `QR_ADMIN_EMAILS` accordingly.
- Add suitable request/abuse limits before public campaigns. Existing bot detection is not rate limiting.
- Set a scan-retention policy and monitoring for redirect failures, gateway errors, and database growth.

The private review is not a declaration that these launch checks have passed.

## Failure and rollback

If a new deployment breaks redirect behavior, roll the Vercel app back to the last verified version without changing the domain or slugs. Applied database migrations need a compatible forward fix; avoid destructive rollback of scan history. If the gateway key leaks, rotate both the Vercel key and Supabase verifier together, redeploy, and verify an actual scan. Do not print secrets in logs while diagnosing failures.

Reports currently aggregate fetched scan rows in the application. At higher volume, move aggregations into owner-scoped database queries and retain the same metric definitions. Add conversion tracking only with an explicit fulfillment-site contract; a redirect alone cannot confirm a book order.
