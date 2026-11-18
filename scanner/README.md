# Public QR scanner

This directory is a standalone Vercel Node.js project for `https://qr.mastrabooks.dev`. Deploy **from this directory**, linked to the scanner project, never the protected Studio project. It has no runtime dependencies and imports nothing outside this directory. The Studio editor, APIs, account code, and Books preview integration are not included.

An explicit route sends only `/q/<12-character slug>` to the single Web Standard function while preserving the original request URL. The handler accepts only `GET` and `HEAD` and validates the pathname again, never a query parameter or forwarded path header. A terminal route returns 404 for everything else, including `/`, `/api/index`, management/auth paths, and malformed slugs; there is no filesystem fallthrough. Other methods on a valid scan path return 405. The reserved `/q/draftpreview` explains an unsaved export and returns 404 without contacting storage. The explicit `public/` build output contains only a generated 404 page, satisfying Vercel's nonempty-output requirement without publishing source or configuration files.

## Server environment

| Variable | Value or purpose |
| --- | --- |
| `SUPABASE_URL` | `https://ltoyhqrorttppcitdwii.supabase.co`; this reviewed project origin is pinned in code |
| `QR_PUBLIC_SCAN_GATEWAY_KEY` | Independent 32–256-character base64url/hex bearer, accepted only by the workspace-scoped `public-scan-gateway` |
| `VERCEL` | Platform-provided; only its value `1` enables Vercel network geography |

Missing/invalid gateway configuration returns 503. Do not install a workspace gateway key, Supabase full-project/service-role key, Books credential, protection bypass, `QR_PRIVATE_PREVIEW`, or `QR_LOCAL_PREVIEW` here. No credential enters a redirect or browser response. The fixed gateway fetch rejects redirects and times out after eight seconds. The function logs only a generic failure category, without request details.

The gateway handles workspace scope, availability, destination UTMs, and scan storage. Its validated destination is returned unchanged as an uncached 302. A scan-storage outage can still redirect; lookup outages return 503. This first release never signs Books attribution or rewrites a Books destination to a preview. Archived/paused/expired codes return 410.

Scans are link visits, not unique people. HEAD, known bots, and prefetches resolve without recording. Country/region/city are approximate Vercel network values and are bounded/sanitized; missing or non-Vercel geography is Unknown. Raw IPs and full user agents are never sent to the gateway. Configure distributed traffic limits on the scanner project's Vercel Firewall before public campaigns; bot classification is not rate limiting. Keep DNS pointed directly to Vercel so an additional proxy does not distort network geography.

## Verify and release

From this directory run `npm ci --ignore-scripts` and `npm run build`. Repository tests include `tests/public-scanner.test.ts` and run from the repository root with `npm test`. The Vercel build also runs this directory's typecheck and generates the sole static 404 page. Unexpected files in the static output cause the build to fail rather than becoming public.

Verify the hosted rewrite preserves the original pathname and does not expose `/api/index?slug=...`, source files, or any Studio route. Test GET/HEAD, draft/unknown/archived codes, real saved destinations, one recorded visit, and the absence of management routes without authentication. Test gateway denial independently. Apply and verify the scanner project's rate limit; keep **all deployments of Studio protected**. Production scanner access is a separate project setting and must not weaken Studio protection.

Only after the permanent domain is working should Studio be rebuilt with both `NEXT_PUBLIC_QR_SCAN_ORIGIN` and `QR_PUBLIC_SCAN_ORIGIN` set to `https://qr.mastrabooks.dev`. Matching settings enable public-link wording and disable simulated Books reports without changing Studio protection. Decode actual PNG/SVG/PDF exports to verify this origin before printing. Existing printed preview URLs cannot acquire a new origin automatically. See the repository's [maintenance guide](../docs/MAINTENANCE.md) for fixture cleanup, retention, monitoring, and rollback.
