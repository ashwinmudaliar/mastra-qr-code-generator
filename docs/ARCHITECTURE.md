# Architecture

## Management and scanning

**Private workspace management:** the browser talks to relative Next.js `/api/*` routes behind Vercel Deployment Protection. `QR_PRIVATE_PREVIEW=1` activates one persistent workspace without creating a Supabase Auth user or app login session. The server requires Vercel's preview environment and its generated deployment hostname, then calls `workspace-gateway` with the server-only `QR_WORKSPACE_GATEWAY_KEY`. The gateway fixes the workspace ID in deployed configuration, validates each supported operation, and scopes all code/report queries to it. Clients cannot supply a workspace, owner, table, or query. The browser never receives the gateway credential.

Vercel protection is the access boundary in this mode; the environment and hostname checks prevent accidental activation elsewhere. Protection must cover all Studio deployments and APIs. The intended reviewer is one person, but authorized Vercel members, granted users, and holders of a protection bypass share the same workspace. This is not per-user authorization within the app.

**Retained account management:** with private mode disabled, Supabase validates the cookie session with `auth.getUser()`. Queries use that user's session and filter by owner; Postgres row-level security independently enforces the same ownership. An optional `QR_ADMIN_EMAILS` allowlist limits account access. This path remains available for a later login rollout.

**Public scanning:** `scanner/` is an independent Vercel project, `mastra-qr-scanner`, with no Studio bundle or management routes. It serves GET/HEAD `/q/<12-character-slug>` at `https://qr.mastrabooks.dev`; other paths return 404 and unsupported methods return 405. Its only database access is `public-scan-gateway`, authenticated with a separate bearer and bound to the same private workspace as Studio. It validates the slug, classifies the visit, and receives a destination after gateway availability checks and optional scan recording. Responses use `302`, `Cache-Control: private, no-store, max-age=0`, and `Referrer-Policy: no-referrer`. Editing a destination preserves the slug.

The scanner has no workspace key, full-project database key, app account session, or Books preview credentials. It never signs Books attribution or rewrites a Books destination to the test portal. Distributed request limits belong at the scanner’s Vercel firewall; in-memory serverless counters and bot classification are insufficient.

**Export origin:** QR artwork uses `NEXT_PUBLIC_QR_SCAN_ORIGIN` when configured, otherwise the Studio browser origin. The Studio server confirms public-link mode with matching `QR_PUBLIC_SCAN_ORIGIN`; only configure this after the public scanner is verified. The dashboard stays protected. Existing preview exports retain their original URL. The protected Next.js `/q/<slug>` route and its original `scan-gateway` remain available for isolated preview checks.

Vercel holds independent random bearer keys for the private scan, public scan, and workspace gateways. Each deployed function holds its key's SHA-256 verifier; Supabase's built-in full-project credential stays inside the Edge Function runtime. Neither scan gateway can list codes, edit them, or retrieve reports. The public gateway additionally filters every lookup to its fixed workspace. The workspace gateway supports only management operations for its fixed workspace. Unsubstituted verifier/configuration placeholders fail closed. A direct service-role scan implementation remains an optional alternative, not the preferred deployment.

A scan-storage failure must not strand a visitor: a valid destination still redirects, with a server-side error logged. Lookup failure returns an unavailable page rather than an invented destination. Archived/paused/expired codes return `410`; unknown codes return `404`.

Archival retains the code row and all scan references. `DELETE /api/codes/:id` and the gateway's legacy `delete` operation set `archived_at` and pause the code; neither permanently deletes it. `POST /api/codes/:id/restore` clears the archive marker and leaves the code paused. Ordinary updates exclude archived rows atomically, so a stale editor cannot reactivate them. All authorized code lists include archived identities for scan and fulfillment reporting; only the library's default presentation hides them. Browser roles cannot DELETE or TRUNCATE code rows. Exact synthetic-fixture purges are an operator-only maintenance action, not an application endpoint.

## Stored data

| Table | Purpose | Access |
| --- | --- | --- |
| `qr_studio_workspaces` | Persistent private workspace identity | Server-managed; no anonymous or ordinary authenticated access |
| `qr_studio_codes` | Owner or private workspace, random 12-character slug, destination, labels, status/expiry, design, UTMs, timestamps | Account owners use RLS; the workspace gateway filters by its fixed workspace |
| `qr_studio_scans` | Code reference, UTC timestamp, country/region/city, coarse device | Account owners read through their codes; workspace gateway reads its codes' scans; scan gateway inserts |

Every code has exactly one ownership scope: `owner_id` references an Auth user, or `private_workspace_id` references a private workspace. A database constraint rejects both-set and neither-set rows. Existing owner RLS stays in place, so private-workspace rows remain inaccessible through anonymous or ordinary authenticated Data API requests. Gateway service credentials bypass RLS; their explicit workspace filters are therefore essential. A later ownership transfer updates these two columns atomically without changing code IDs, slugs, or scan references; see [maintenance](MAINTENANCE.md#adding-account-login-later).

Logos are decoded and re-encoded as small raster data URLs inside the design JSON; there is no separate file bucket. Input accepts PNG/JPEG/WebP up to 2 MB, normalizes to a maximum 256 px dimension, and rejects active SVG content.

The initial schema is versioned under `supabase/migrations/`. `supabase/schema.sql` is an explanatory copy of that initial schema, not a migration runner. Append migrations rather than rewriting applied history.

## Counting and attribution

- Each GET to a tracking link can count once. Known bots, prefetches, and HEAD requests are excluded; detection is best effort.
- No raw IP address, full user-agent string, visitor cookie, or unique-person identifier is stored.
- Vercel-supplied network geography is used only in Vercel runtime. Missing fields become `Unknown`; local review does not manufacture geography.
- Reports aggregate in UTC, group by event/book/code and coarse location/device, and expose the latest 100 visits. Exact daily counts accompany the chart. CSV exports of recent visits are not complete event-history exports.
- Event/book/placement labels identify the code's campaign. Location cannot establish which booth or event a person attended.
- UTM parameters preserve other query parameters and URL fragments. Fulfillment conversion reporting requires an integration with the destination site.
- The protected Books preview integration, when public-link mode is disabled, adds a signed reference only for a recorded visit to the standard Books root intake. Separate partner/card/Agents in Prod routes are excluded. Saved destinations and slugs stay unchanged; a configured private preview rewrites the Books root destination to the protected test portal. See [Books attribution](FULFILLMENT.md).
- Public-link mode disables simulated Books redirects and reports in the active Studio. Results states that live fulfillment reporting is not connected; older protected preview deployments retain their isolated simulation.
- Fulfillment reports use the original visit date and frozen event labels. Existing scan reports group by the code's current labels. The UI explains historical-label selections and does not calculate a misleading conversion rate across those definitions.
- Scan records currently have no automatic retention/expiry policy. Analytics reads paginated records and aggregates in the application; high-volume traffic will need database aggregation and a retention decision.

## Source map

| Area | Files |
| --- | --- |
| Workspace shell, editor and its state | `components/studio.tsx`, `app/page.tsx` |
| Codes list and Results | `components/codes-list.tsx`, `components/results.tsx`, `components/scan-chart.tsx` |
| Shared controls (fields, menu, dialog) | `components/ui.tsx` |
| Visual system | `app/globals.css`, `docs/DESIGN.md` |
| Artwork, upload normalization, downloads | `lib/qr-design.ts`, `lib/qr-export.ts`, `components/qr-preview.tsx` |
| Sticker sheets | `lib/sticker-sheet.ts`, `components/sticker-sheet-dialog.tsx` |
| Tracking link and draft placeholder | `lib/tracking-link.ts`, `app/q/[slug]/route.ts` |
| API validation and ownership | `lib/server/validation.ts`, `lib/server/context.ts`, `lib/server/repository.ts` |
| Protected private workspace | `lib/server/private-preview.ts`, `supabase/functions/workspace-gateway/` |
| Visit classification and reports | `lib/server/analytics.ts`, `app/api/analytics/route.ts` |
| Public scan path | `scanner/`, `supabase/functions/public-scan-gateway/` |
| Protected preview scan path | `app/q/[slug]/route.ts`, `supabase/functions/scan-gateway/` |
| Auth | `lib/supabase/`, `app/api/auth/`, `app/auth/callback/route.ts` |
| Local-only storage | `lib/server/local-store.ts` |

Client/server contracts live in `lib/types.ts`. The database uses snake_case columns; repository conversion exposes camelCase API fields. Keep partial-update validation and owner/workspace filtering when changing the contracts. Local review remains a distinct development + explicit flag + loopback-only file store; it never becomes hosted persistence.

## Boundaries

This is a Mastra event/book QR workspace, not a complete commercial QR SaaS clone. It has no billing, team roles/shared ownership, SSO provisioning, precise GPS, unique-visitor tracking, production fulfillment reporting, or dynamic file/vCard/Wi-Fi content. The Books connection currently uses isolated test requests and explicit simulated fulfillment. Do not imply capabilities or production evidence that have not been activated and verified.
