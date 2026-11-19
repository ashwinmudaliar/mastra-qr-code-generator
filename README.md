# Mastra QR Studio

A QR code workspace for Mastra books and events. Create a code for each event or placement, customize the artwork, and track visits before forwarding people to the book fulfillment site.

Built with Next.js, Supabase Postgres, and Vercel. The Google-login path is for one creator, `ashwin@mastra.ai`, at [mastra-qr-studio.vercel.app](https://mastra-qr-studio.vercel.app). The dashboard uses a verified Google session and owner-scoped data; there is no team or signup workflow. Public scan links stay at `https://qr.mastrabooks.dev/q/<slug>`, served by the separate `scanner/` service. Opening the bare scan domain redirects to the dashboard.

This branch adds that login path and the ownership transition; it does not establish that cloud setup or deployment has completed. Follow the [Google login rollout](docs/MAINTENANCE.md#google-login-rollout) and record hosted verification before treating the standard address as ready. The [18 November release record](docs/PUBLIC-LAUNCH.md) describes the earlier protected, account-free preview and public scanner.

Older account-free previews rely on Vercel access protection and a fixed workspace. Retire their management credential after transferring the existing codes to the Google account. The transfer keeps IDs, slugs, artwork and history, so existing public printouts keep working. Exports made with an older protected preview address must still be downloaded again to use the public origin.

## What works

- Dynamic links with editable destinations, pause/resume, optional expiry, and reversible archival that keeps scan and fulfillment history.
- Logo uploads, colors and gradients, dot/corner styles, frames, and captions.
- PNG, SVG, and PDF downloads using the saved tracking link, plus print-at-home sticker sheets for 3″ square labels (six per US Letter sheet, PLS451 / Avery 94101 layout) with an alignment test page.
- Event, book, placement, and UTM labels; bulk creation of up to 25 codes.
- Codes grouped by event, and Results that compare scans and book requests by event, code, or book, with daily scans, approximate scan locations, shipping destinations, and CSV exports.
- Private Books attribution preview: signed QR visits connect to test book requests and simulated shipment/delivery results. Books production remains unchanged; no real books or emails are sent in this flow.

A scan is a tracking-link visit, not a unique person or fulfilled order. Location is approximate. Use separate codes for reliable event attribution. Existing printed static QR codes do not automatically acquire tracking, and exports containing a protected preview address cannot acquire the permanent domain later.

Public scanning forwards to the saved destination, including the existing Books portal, without changing Books fulfillment or adding live attribution. Real fulfillment reporting remains a separate release; any connected preview request/shipment results are simulated.

## Run locally

Use Node.js 22 or newer. Keep the checkout, dependencies, build output, and caches outside iCloud-synced Desktop/Documents folders; `~/Developer` is the default location on the author's Mac.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open [the local studio](http://127.0.0.1:3147). The example enables local review mode: codes and scans live in ignored `.data/qr-studio.json`, and no Supabase account is required. It works only with the development server on loopback. A production build never enables this bypass.

Local review remains account-free. Google login requires its fixed HTTPS dashboard origin, Supabase configuration and Google OAuth setup; it intentionally rejects the local and private-preview flags. The older `QR_PRIVATE_PREVIEW=1` mode works only on its protected Vercel preview address and uses a scoped workspace gateway. For setup, see [Supabase setup](supabase/SETUP.md).

## Check a change

```sh
npm run typecheck
npm test
npm run build
```

With the local development server running:

```sh
QR_TEST_URL=http://127.0.0.1:3147 node scripts/verify-backend.mjs
```

For a browser pass with that server running, install the test browser with `npx playwright install chromium --only-shell` and run `node scripts/audit-ui.mjs`. It checks saved exports and desktop/phone layouts and saves artifacts under ignored `outputs/design-audit/`. For a focused readability pass, run `node scripts/audit-mobile.mjs`. It captures 320/360/390/430/1100/1440px layouts, checks that no text is under 12px, text contrast, 44px controls on phones and page overflow, and saves results under ignored `outputs/mobile-readability/`. If the pinned Playwright browser isn't installed, set `QR_BROWSER_PATH` to another Chromium executable.

The HTTP and browser checks create and archive their own temporary codes and record exact IDs for operator cleanup. Archiving keeps history; it is not permanent deletion. QR tests decode actual artwork, including logos, gradients, frames, and pattern combinations. `tests/rls.sql` and `tests/private-workspace-rls.sql` verify account/workspace access boundaries in transactions that roll back their fixtures; run both against the intended Supabase test project after schema changes.

## Project guide

- [Design](docs/DESIGN.md): Mastra tokens, component behavior, copy, and review criteria.
- [Architecture](docs/ARCHITECTURE.md): data flow, ownership, scan semantics, and source map.
- [Books attribution](docs/FULFILLMENT.md): integration contract, isolated preview, reporting definitions, and release boundary.
- [Maintenance](docs/MAINTENANCE.md): development, deployment, migrations, and launch checks.
- [Public scanner](scanner/README.md): the independently deployed redirect service.
- [Agent instructions](AGENTS.md): repository rules for future coding agents.
- [Maintenance skill](.agents/skills/maintain-qr-studio/SKILL.md): a focused workflow for agent-assisted changes.
- [Design audit](docs/DESIGN-AUDIT.md): observed issues, changes, and remaining simplifications.
- [Asset provenance](docs/ASSETS.md): logos and fonts used by the Mastra-specific interface.

The repository's existing [Apache 2.0 license](LICENSE) is preserved. Brand assets and fonts remain subject to their own rights; the source-code license does not grant Mastra trademark or third-party font rights.
