# Public scanning release — 18 November 2026

Public scan links use `https://qr.mastrabooks.dev/q/<slug>`. The editor and Results remain in the protected, account-free Studio. Open the Studio link below to create or re-export codes; the scan domain intentionally has no dashboard or home page.

| Service | Deployment | Source |
| --- | --- | --- |
| [Private Studio](https://mastra-qr-studio-7hcwdybe3-ashwinm546.vercel.app) | `dpl_3SjjJr2MoGN5MuVFNrLFqAk6J3cy`, preview, READY, no aliases | `ad77f28` |
| Scanner at `qr.mastrabooks.dev` | `dpl_DhG2G7FAjUd2SyBZ7b9Wx62Yh19g`, production, READY | `d1f7799` |

Later changes on this release branch update verification and documentation only. Studio keeps Vercel Authentication on All Deployments. Scanner uses Standard Protection: its public production domains work without authentication while generated deployment URLs and previews remain protected. The projects have no Git integration. Only the scanner received the scan subdomain; Books' existing domains remain attached to Books.

The public Supabase gateway has its own bearer verifier and fixed private-workspace filter. The public Vercel project has only `SUPABASE_URL` and `QR_PUBLIC_SCAN_GATEWAY_KEY`, in addition to Vercel's system variables. It has no workspace, full-project database, Books, local-preview, or protection-bypass credentials. No database migration or browser grant changed for this release.

## Verified

- Root typecheck, 75 tests, Studio production build, scanner build, and the local HTTP verifier passed.
- Unsigned Studio page/session/code/analytics/fulfillment/scan requests require Vercel access. Public scanner management, auth, direct function, and source-file paths return 404.
- Hosted create, logo upload, save, fresh-session reopen, PNG/SVG/PDF and US Letter sticker-sheet downloads passed. Actual exports encode the permanent scan origin.
- Independent checks decoded PNG/SVG/PDF at native size and 800/1200/1600px for the final fixture. Saved upload and embedded logo hashes match. All six sticker crops decode, with the expected 3″ layout and safety insets.
- A prior fixture's native-size PNG missed in jsQR, while every 800–1600px reading passed. The verifier retains native diagnostics and requires all three practical sizes to decode the exact saved URL; no artwork was changed to hide that result.
- Anonymous scans record visits in private Results. Destination edits preserve the slug. HEAD, known bots and prefetches add no visits; unsupported scan methods return 405. Pause, expiry and archive return 410. Restore leaves the same code paused, with history retained.
- Draft exports explain that they were printed from an unsaved preview. Mobile archived/expiry labels wrap without overflow at 320px. The focused layout check passed 24 states across six widths.
- The scanner firewall is enabled with a distributed 600-request/60-second limit per IP for `/q/`. A bounded probe against an invalid path returned 600 normal 404s and then 429s, without querying or writing scan data.
- Both exact hosted fixtures and the local HTTP fixture were removed after archival/history checks. Existing user data was preserved.

Detailed receipts and screenshots are ignored local artifacts under `outputs/public-scanning/`, `outputs/public-scanning-review-1/`, and `outputs/code-status-layout/`. They are not public customer-data exports.

## Remaining boundaries

Books production is unchanged (`dpl_5knShjKk9ALw6YFAdHVRgudKyj4J`). Public scans open the saved destination without signing attribution or rewriting to the Books test portal. Studio reports live fulfillment as not connected; the isolated simulation remains available in older protected previews. No Books merge, migration, production deployment, or account setup was performed.

Physical paper/phone testing was not performed by this automated release check. Scan a sample on the intended sticker stock before printing an event batch. Previously exported preview URLs remain private; re-export from the current Studio for public use.

Operational visibility comes from Vercel request/function logs and firewall reports, plus Supabase gateway logs. External uptime alerts are not configured. Review redirect/recording failures and legitimate rate-limit hits during campaigns. Scan history currently has no automatic deletion policy; archival preserves it. See [Maintenance](MAINTENANCE.md) for subsequent deployments, incident response, and the separate Books/account release paths.
