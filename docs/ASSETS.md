# Asset provenance

This application is built for Mastra. Brand assets were obtained from the user's supplied Mastra sites during the initial build on 2026-11-17:

| Local asset | Source |
| --- | --- |
| `public/mastra-logo.svg` | `https://mastrabooks.dev/mastra-logo.svg` |
| Built-in QR symbol in `lib/qr-export.ts` | Symbol paths from the same Mastra logo |
| Greed Standard (remote font) | `https://mastra.ai/_next/static/immutable/media/GreedVF-s.p.3f1gxdbuwob3i.woff2` |
| Commit Mono (remote font) | `https://mastra.ai/_next/static/immutable/media/CommitMonoMastra500_Regular-s.p.1802g5xp2xkrh.woff2` |

The design reference is [Mastra's kitchen sink](https://mastra.ai/dev/kitchen-sink). Font files are referenced from the official Mastra host rather than redistributed in this public repository. Generated `/_next/static/` URLs may change; a failed font request falls back to the CSS font stack. Check these URLs during design reviews and update them from the approved brand source when needed.

The existing Apache 2.0 source-code license does not relicense these fonts or grant rights to Mastra names, logos, and marks. Preserve applicable upstream rights and attribution. Downstream projects should supply assets they have permission to use. Dependencies retain the licenses recorded in their packages.
