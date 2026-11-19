---
name: maintain-qr-studio
description: Build, review, or maintain this Mastra QR Studio repository, including its branded editor, exports, tracking routes, Supabase ownership, and private Vercel deployment. Use for changes in this project, not unrelated QR services or general Mastra framework work.
---

# Maintain Mastra QR Studio

Read the repository's [AGENTS.md](../../../AGENTS.md) first. It defines the workspace, credential, ownership, printed-link, and private-review boundaries. This skill does not authorize a public launch or changes to unrelated Mastra systems.

Choose the relevant reference rather than loading every document:

- UI or design review: [Design](../../../docs/DESIGN.md). Match the user's Mastra kitchen-sink reference. Review actual screens and meaningful interaction states, then remove copy or structure that does not aid the task.
- Data or scan behavior: [Architecture](../../../docs/ARCHITECTURE.md). Google mode uses a verified Google session, exact-email authorization and owner RLS. Older account-free previews use Vercel protection and a fixed-workspace gateway; the separate public gateway resolves tracking links within its deployed ownership scope.
- Deployment, auth, migrations, or incidents: [Maintenance](../../../docs/MAINTENANCE.md) and [Supabase setup](../../../supabase/SETUP.md). Keep secrets out of source and preserve private review until launch is requested.

## Make the change

Inspect the current implementation and applicable tests before editing. Preserve saved slugs and the definition of scan metrics. A decorative preview is insufficient: exported QR artwork must represent all styling and decode to the intended saved link.

Keep archived identities in scan and fulfillment reporting. Archival stops redirects and editing; restoration preserves identity and leaves the code paused. Do not reintroduce permanent deletion through a browser or gateway cleanup shortcut.

Keep the management modes distinct: local loopback review, protected Vercel private workspace, and Google-only owner sessions. The Google dashboard is for `ashwin@mastra.ai` at the standard Vercel address; do not add teams or broader access without a request. Only its verified production alias may use app authentication instead of the Vercel gate. Generated URLs and previews stay protected.

Public scanning uses the separate `scanner/` deployment and fixed-scope public gateway. Preserve the existing scan origin and printed links; the scanner's root only redirects to Studio. Keep management/Books credentials out of that deployment. Preserve ownership filters and the exactly-one-owner constraint; never grant anonymous database access to avoid a login screen. Follow the transition-scope, atomic ownership-transfer and credential-retirement steps in Maintenance so existing codes and history survive. Missing Google auth configuration must fail closed.

For a bug, establish a failing behavior or concrete state, then verify the repaired outcome. For a UI change, inspect desktop and phone widths plus relevant empty, error, loading, and saved states. Distinguish observed problems from suggested future work.

## Verify and report

Use the repository's typecheck, test, build, HTTP verifier, and RLS checks according to what changed. Read test scripts before pointing them at a database; use disposable records and retain their cleanup boundaries. For hosted private access changes, verify protected page/API/scan requests without Vercel access and test the real workspace flow through authorized access. For Google login, verify the exact allowed identity, denial of other identities and signed-out management requests, same-origin OAuth/logout, fixed callbacks, disabled password/signup endpoints, existing data after transfer and rejection of the retired workspace bearer. For public-scanner changes, also test unsigned redirects and recorded visits, the absence of management routes, HEAD/bot exclusions, paused/expired/archived codes, and the deployed firewall limit. Do not treat a successful build or local test as proof of hosted access, persistence, or signup.

Report what changed, why, how it was verified, and any remaining constraint that affects use. In a design audit, prioritize the few issues that impede making, finding, exporting, or interpreting a code. Do not imply paid-product parity for capabilities the implementation does not provide.
