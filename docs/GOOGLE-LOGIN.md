# Google login release — 19 November 2026

The dashboard is live at [mastra-qr-studio.vercel.app](https://mastra-qr-studio.vercel.app), with Google sign-in restricted to `ashwin@mastra.ai`. Public tracking links remain at `qr.mastrabooks.dev/q/<slug>`. The bare scan domain redirects to the dashboard. This record describes observed deployment results; [Maintenance](MAINTENANCE.md#google-login-rollout) contains the repeatable rollout procedure.

## Deployed versions

Both production deployments use runtime source commit `79ac641`.

| Service | Deployment ID | Generated hostname |
| --- | --- | --- |
| Studio | `dpl_HNX7oakcr6kuzWbabh5YCkLHLbFV` | `mastra-qr-studio-kicq9w1px-ashwinm546.vercel.app` |
| Scanner | `dpl_7Wgs3kRLupcQgqSscucBZDbSTUKu` | `mastra-qr-scanner-99d1cw153-ashwinm546.vercel.app` |

Studio uses Vercel Standard protection (`prod_deployment_urls_and_all_previews`): its stable production alias reaches the app's Google login; generated URLs and old previews remain Vercel-protected. Git integration remains disconnected. No PR was merged for this deployment.

Google Cloud project `mastra-qr-studio` (number `336931187286`) has an Internal OAuth audience and basic identity scopes only. Supabase has Google enabled, Email disabled and new-user signup disabled after the intended Google user was verified. Studio production has only the seven configuration variables documented in [Setup](../supabase/SETUP.md#google-login), with no workspace bearer, private scan key, full-project database key or Books preview credentials.

## Observed checks

| Check | Result |
| --- | --- |
| Signed-out dashboard | Passed: HTTP 200 with Google sign-in; session reports no user |
| Signed-out codes, analytics and fulfillment | Passed: HTTP 401 |
| Password/signup endpoints; cross-origin Google start | Passed: HTTP 403 |
| Generated Studio URL and older preview | Passed: Vercel authentication redirect (302) |
| Studio's legacy scan route | Passed: valid-slug HEAD fails closed with 503; draft placeholder returns 404 |
| Actual Google login, logout and login after signup closure | Passed: the allowed account returned to Codes with the original code |
| Save and reload a fictional code | Passed |
| PNG, SVG and PDF downloads | Passed: downloaded artifacts decoded to the expected public tracking link |
| Public tracking and Results | Passed: two synthetic scans appeared; archive stopped the link with 410 |
| Bare `qr.mastrabooks.dev` | Passed: uncached 302 to the canonical dashboard; existing `/q/` behavior preserved |
| Mobile sign-in at 320 px | Passed: no horizontal overflow, 20/14.5 px text and 44 px button |
| Automated checks | Passed: 89 tests, typecheck, root build and scanner build |
| Fixture cleanup | Passed: the exact synthetic code and its two scans were removed |

The original workspace code moved to the verified owner in one update. Its content hash was unchanged after excluding ownership fields and `updated_at`. The public gateway moved through version 2's fixed workspace/owner transition scope to version 3's owner-only scope. Workspace gateway version 3 revoked the old verifier; the former credential now fails closed with 503. The preview project variables `QR_PRIVATE_PREVIEW` and `QR_WORKSPACE_GATEWAY_KEY` were removed. Old account-free previews can no longer manage the workspace even through authorized Vercel access.

After cleanup, the project contained one Auth user, one original code, no scan fixtures and no preview requests. The final browser check showed the signed-in account and original code; its screenshot is retained in ignored `outputs/google-login/dashboard-live.jpg`. Credentials and record identifiers are deliberately absent from this public record.

## Remaining boundaries

Books production was unchanged. Live fulfillment reporting is not connected; the earlier Books integration remains an isolated simulation. This release did not test a physical printed code with a phone. Existing exports containing an older protected preview hostname do not acquire the public scan origin automatically; download them again before printing.

Only the public scanner resolves production tracking links. Studio intentionally lacks credentials for its legacy scan handler; keep that exclusion when redeploying. For an access incident, restore Vercel All Deployments protection while repairing login, without changing the separate scanner's hostname or saved slugs.
