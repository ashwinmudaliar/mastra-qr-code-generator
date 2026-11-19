# Mastra QR Studio: agent instructions

This repository contains a Next.js QR editor on Vercel with Supabase Postgres. Google login is a single-user path for `ashwin@mastra.ai`; older protected previews use a fixed workspace without an app account. Start with [README.md](README.md); read [docs/DESIGN.md](docs/DESIGN.md) for UI work and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) plus [docs/MAINTENANCE.md](docs/MAINTENANCE.md) for behavior or deployment changes.

## Working boundaries

- Keep development work outside iCloud-synced Desktop/Documents. Resolve the destination before creating checkouts, installing dependencies, or building. Default new work to `~/Developer`.
- This is a public repository. Never commit `.env*` credentials, `.vercel/`, `.data/`, generated test accounts, deployment secrets, or customer scan exports. `.env.example` contains names and empty examples only.
- Preserve remote history and existing user changes. Use `codex/` branches for feature work; do not force-push or merge unrelated work.
- Maintain owner-scoped RLS and fixed-workspace filtering. Codes must have exactly one owner or private workspace; anonymous Data API access stays denied. Supabase user metadata is not an authorization boundary. Keep separate scan/workspace gateway credentials server-only.
- Preserve saved QR slugs and printed-link behavior. Destination edits must not create a new slug; changing the hosting origin cannot update printed codes.
- Archive codes instead of permanently deleting them. Preserve code IDs, scans, and fulfillment report scope; restore to paused. Keep permanent fixture cleanup outside application/gateway endpoints and target only exact operator-created records.
- Keep local preview bypass restricted to development + explicit flag + loopback. It must never work in production.
- Google mode requires `QR_GOOGLE_LOGIN=1`, an exact `QR_ADMIN_EMAILS` allowlist and fixed `QR_STUDIO_ORIGIN`. Verify the Supabase user and Google identity on every management request; never trust user-editable metadata. Keep signup/password endpoints disabled in this mode. Do not add team roles or broaden access beyond the requested creator.
- Hosted account-free Studio requires its explicit private flag, Vercel preview environment, generated hostname and Vercel Deployment Protection. Google mode rejects private/local bypass flags. Only the verified Google-login production alias may use app authentication instead of Vercel authentication; generated URLs and previews stay protected.
- Public scanning is a separate `scanner/` Vercel project at `qr.mastrabooks.dev`, with GET/HEAD tracking routes and a fixed-scope public scan credential. Its root redirects to `https://mastra-qr-studio.vercel.app/`; management routes remain absent. Never copy management, service-role, Books preview, or bypass credentials into it. Public scanning or Studio login does not authorize a Books production release.

## Product and design

Use Mastra's kitchen-sink system: Greed Standard, Commit Mono, dark neutral surfaces, and green `#7aff78`. Follow the maintained design document rather than adding a new visual theme. Keep QR artwork contrast/quiet zones independent of the dark dashboard.

Prefer literal task labels and concise explanations. Remove ornamental filler; do not add fake campaigns, metrics, success states, or controls without behavior. Unsaved previews encode the `/q/draftpreview` placeholder, never the destination; keep them visibly distinct from saved tracking links, and keep private review distinct from public event readiness. Follow the rules at the top of [docs/DESIGN.md](docs/DESIGN.md): no text under 12 px at any width, each caveat stated once. Report visits and approximate geography honestly; do not call them unique people, precise locations, or fulfilled orders.

All QR customization must be represented in real downloads. Keep high error correction, a four-module quiet zone, conservative logos, upload normalization, and decoder coverage when changing rendering.

## Check and hand off

Use `npm run typecheck`, `npm test`, and `npm run build` as appropriate. Use the local HTTP verifier after route changes, RLS checks after schema changes, and desktop/mobile screen review after UI changes. Avoid rerunning unrelated checks after unchanged successful results.

Keep applied migrations immutable. See [supabase/SETUP.md](supabase/SETUP.md) for Google Auth and gateway configuration. Follow the ownership rollout in Maintenance: deploy the exact workspace/owner transition scope, transfer codes atomically, then restrict public scanning to that owner and revoke the old workspace gateway verifier. Removing an environment variable alone does not revoke old deployments. Preserve IDs/slugs/history and report observed verification without claiming untested integrations.

The repository-scoped [maintenance skill](.agents/skills/maintain-qr-studio/SKILL.md) provides a focused workflow for recurring changes.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
