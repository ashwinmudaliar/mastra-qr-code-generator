# Architecture

## The two paths

**Management:** the browser talks to Next.js `/api/*` routes on Vercel. Supabase validates the cookie session with `auth.getUser()`. Queries use that user's session and filter by owner; Postgres row-level security independently enforces the same ownership. An optional `QR_ADMIN_EMAILS` allowlist limits access to the studio.

**Scanning:** the QR artwork contains `/q/<slug>` at `NEXT_PUBLIC_QR_SCAN_ORIGIN` when configured, otherwise the current browser origin. Next.js validates the slug, classifies the visit, and calls the authenticated Supabase scan gateway. The gateway looks up one code, checks status/expiry, optionally stores a scan, and returns its destination. Next.js responds with a `302` and `Cache-Control: private, no-store, max-age=0`. Editing a destination preserves the slug.

Vercel holds a random, narrowly scoped gateway bearer key. Supabase holds only its SHA-256 verifier in deployed function source; Supabase's built-in full-project credential stays inside its Edge Function runtime. The gateway cannot list codes, edit them, or retrieve reports. The source placeholder intentionally fails closed until deployment substitutes the verifier. A direct service-role implementation remains an optional alternative, not the preferred deployment.

A scan-storage failure must not strand a visitor: a valid destination still redirects, with a server-side error logged. Lookup failure returns an unavailable page rather than an invented destination. Paused/expired codes return `410`; unknown codes return `404`.

## Stored data

| Table | Purpose | Access |
| --- | --- | --- |
| `qr_studio_codes` | Owner, random 12-character slug, destination, labels, status/expiry, design, UTMs, timestamps | Owner CRUD through RLS |
| `qr_studio_scans` | Code reference, UTC timestamp, country/region/city, coarse device | Owner reads through the owned code; gateway inserts |

Logos are decoded and re-encoded as small raster data URLs inside the design JSON; there is no separate file bucket. Input accepts PNG/JPEG/WebP up to 2 MB, normalizes to a maximum 256 px dimension, and rejects active SVG content.

The initial schema is versioned under `supabase/migrations/`. `supabase/schema.sql` is an explanatory copy of that initial schema, not a migration runner. Append migrations rather than rewriting applied history.

## Counting and attribution

- Each GET to a tracking link can count once. Known bots, prefetches, and HEAD requests are excluded; detection is best effort.
- No raw IP address, full user-agent string, visitor cookie, or unique-person identifier is stored.
- Vercel-supplied network geography is used only in Vercel runtime. Missing fields become `Unknown`; local review does not manufacture geography.
- Reports aggregate in UTC, group by event/book/code and coarse location/device, and expose the latest 100 visits. Exact daily counts accompany the chart. CSV exports of recent visits are not complete event-history exports.
- Event/book/placement labels identify the code's campaign. Location cannot establish which booth or event a person attended.
- UTM parameters preserve other query parameters and URL fragments. Fulfillment conversion reporting requires an integration with the destination site.
- Scan records currently have no automatic retention/expiry policy. Analytics reads paginated records and aggregates in the application; high-volume traffic will need database aggregation and a retention decision.

## Source map

| Area | Files |
| --- | --- |
| Workspace UI and its state | `components/studio.tsx`, `app/page.tsx` |
| Visual system | `app/globals.css`, `docs/DESIGN.md` |
| Artwork, upload normalization, downloads | `lib/qr-design.ts`, `lib/qr-export.ts`, `components/qr-preview.tsx` |
| API validation and ownership | `lib/server/validation.ts`, `lib/server/context.ts`, `lib/server/repository.ts` |
| Visit classification and reports | `lib/server/analytics.ts`, `app/api/analytics/route.ts` |
| Public scan path | `app/q/[slug]/route.ts`, `supabase/functions/scan-gateway/` |
| Auth | `lib/supabase/`, `app/api/auth/`, `app/auth/callback/route.ts` |
| Local-only storage | `lib/server/local-store.ts` |

Client/server contracts live in `lib/types.ts`. The database uses snake_case columns; repository conversion exposes camelCase API fields. Keep partial-update validation and owner filtering when changing the contracts.

## Boundaries

This is a Mastra event/book QR workspace, not a complete commercial QR SaaS clone. It has no billing, team roles/shared ownership, SSO provisioning, precise GPS, unique-visitor tracking, order conversion integration, or dynamic file/vCard/Wi-Fi content. Do not imply those capabilities in copy or sample data.
