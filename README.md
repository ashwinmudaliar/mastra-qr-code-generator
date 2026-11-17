# Mastra QR Studio

A QR code workspace for Mastra books and events. Create a code for each event or placement, customize the artwork, and track visits before forwarding people to the book fulfillment site.

Built with Next.js, Supabase Auth/Postgres, and Vercel. The source repository is public; the deployed preview is access-protected for review. Event attendees cannot freely scan a protected preview.

## What works

- Dynamic links with editable destinations, pause/resume, and optional expiry.
- Logo uploads, colors and gradients, dot/corner styles, frames, and captions.
- PNG, SVG, and PDF downloads using the saved tracking link.
- Event, book, placement, and UTM labels; bulk creation of up to 25 codes.
- A searchable code library, event/book/code comparisons, daily scan reports, country/city/device summaries, and CSV exports.

A scan is a tracking-link visit, not a unique person or fulfilled order. Location is approximate. Use separate codes for reliable event attribution. Existing printed static QR codes do not automatically acquire tracking.

## Run locally

Use Node.js 22 or newer. Keep the checkout, dependencies, build output, and caches outside iCloud-synced Desktop/Documents folders; `~/Developer` is the default location on the author's Mac.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open [the local studio](http://127.0.0.1:3147). The example enables local review mode: codes and scans live in ignored `.data/qr-studio.json`, and no Supabase account is required. It works only with the development server on loopback. A production build never enables this bypass.

To exercise Supabase locally, set `QR_LOCAL_PREVIEW=0`, configure the project URL and publishable key, and sign in. For hosted setup and the scan gateway, see [Supabase setup](supabase/SETUP.md).

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

For a browser pass with that server running, install the test browser with `npx playwright install chromium --only-shell` and run `node scripts/audit-ui.mjs`. It checks saved exports and desktop/phone layouts and saves artifacts under ignored `outputs/design-audit/`. For a focused mobile readability pass, run `node scripts/audit-mobile.mjs`. It captures 320/360/390/430px layouts, checks minimum text/control sizes and page overflow, and saves results under ignored `outputs/mobile-readability/`.

The HTTP and browser checks create and remove their own temporary codes. QR tests decode actual artwork, including logos, gradients, frames, and pattern combinations. `tests/rls.sql` verifies database access boundaries inside a transaction that rolls back its fixtures; run it against the intended Supabase test project after schema changes.

## Project guide

- [Design](docs/DESIGN.md): Mastra tokens, component behavior, copy, and review criteria.
- [Architecture](docs/ARCHITECTURE.md): data flow, ownership, scan semantics, and source map.
- [Maintenance](docs/MAINTENANCE.md): development, deployment, migrations, and launch checks.
- [Agent instructions](AGENTS.md): repository rules for future coding agents.
- [Maintenance skill](.agents/skills/maintain-qr-studio/SKILL.md): a focused workflow for agent-assisted changes.
- [Design audit](docs/DESIGN-AUDIT.md): observed issues, changes, and remaining simplifications.
- [Asset provenance](docs/ASSETS.md): logos and fonts used by the Mastra-specific interface.

The repository's existing [Apache 2.0 license](LICENSE) is preserved. Brand assets and fonts remain subject to their own rights; the source-code license does not grant Mastra trademark or third-party font rights.
