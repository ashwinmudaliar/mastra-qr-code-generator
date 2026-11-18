---
name: maintain-qr-studio
description: Build, review, or maintain this Mastra QR Studio repository, including its branded editor, exports, tracking routes, Supabase ownership, and private Vercel deployment. Use for changes in this project, not unrelated QR services or general Mastra framework work.
---

# Maintain Mastra QR Studio

Read the repository's [AGENTS.md](../../../AGENTS.md) first. It defines the workspace, credential, ownership, printed-link, and private-review boundaries. This skill does not authorize a public launch or changes to unrelated Mastra systems.

Choose the relevant reference rather than loading every document:

- UI or design review: [Design](../../../docs/DESIGN.md). Match the user's Mastra kitchen-sink reference. Review actual screens and meaningful interaction states, then remove copy or structure that does not aid the task.
- Data or scan behavior: [Architecture](../../../docs/ARCHITECTURE.md). The current account-free workspace uses Vercel access protection and a fixed-workspace gateway. The retained account path uses verified user sessions + RLS; the separate scan gateway resolves tracking links.
- Deployment, auth, migrations, or incidents: [Maintenance](../../../docs/MAINTENANCE.md) and [Supabase setup](../../../supabase/SETUP.md). Keep secrets out of source and preserve private review until launch is requested.

## Make the change

Inspect the current implementation and applicable tests before editing. Preserve saved slugs and the definition of scan metrics. A decorative preview is insufficient: exported QR artwork must represent all styling and decode to the intended saved link.

Keep the three access modes distinct: local loopback review, protected Vercel private workspace, and Supabase account sessions. Private preview does not require signup or email setup. Preserve workspace filters and the exactly-one-owner constraint; never grant anonymous database access to avoid a login screen. When introducing account login, follow the ownership-transfer and credential-retirement steps in Maintenance so saved links and scan history survive.

For a bug, establish a failing behavior or concrete state, then verify the repaired outcome. For a UI change, inspect desktop and phone widths plus relevant empty, error, loading, and saved states. Distinguish observed problems from suggested future work.

## Verify and report

Use the repository's typecheck, test, build, HTTP verifier, and RLS checks according to what changed. Read test scripts before pointing them at a database; use disposable records and retain their cleanup boundaries. For hosted private access changes, verify protected page/API/scan requests without Vercel access and test the real workspace flow through authorized access. Do not treat a successful build or local test as proof of hosted access, persistence, or signup.

Report what changed, why, how it was verified, and any remaining constraint that affects use. In a design audit, prioritize the few issues that impede making, finding, exporting, or interpreting a code. Do not imply paid-product parity for capabilities the implementation does not provide.
