# Design

The interface follows [Mastra's kitchen sink](https://mastra.ai/dev/kitchen-sink), as requested. This is a utility for producing and managing codes, so each visual element should support editing, checking, exporting, or comparing a code.

## Brand system

| Role | Token / value |
| --- | --- |
| Sans | Greed Standard variable; headings use roughly weight 520 / width 112 |
| Mono | Commit Mono; labels, technical values, compact metadata |
| Main text | `#f0f0f0` |
| Secondary text | `#cccccc` / `#939393` |
| Background | `#020202` |
| Grouped surface | `#0d0d0d` |
| Raised surfaces | `#141414` / `#1a1a1a` |
| Hover | `#262626` |
| Primary accent | `#7aff78` |
| Supporting accents | Orange `#fdac53`, pink `#ff69cc`, purple `#b588fe`, blue `#6ccdfb`, red `#ff4758`, yellow `#e7e67b` |
| Section spacing | 28 px / 38 px; reduce purposefully on small screens |
| Brand surface radii | 16–21 px elevation, 30–42 px outer grouping; use smaller control radii where density calls for it |
| Body reference | 14.5 px / 136% line-height; do not shrink essential labels to decorative microtype |

Fonts load from the official Mastra host, with local system fallbacks if unavailable. Keep font binaries out of the public repository unless redistribution rights have been supplied. CSS is the implementation source of truth. Keep shared colors and type choices centralized rather than adding a competing palette for a new panel. The QR artwork is a separate object: it keeps its own light background, quiet zone, and scannable contrast regardless of the dashboard theme.

## Task structure

- **Create:** destination and a recognizable name first; optional event/book/placement labels afterward.
- **Design:** presets as a starting point, then logo, colors, shapes, and frame. Every control must change the actual exported image.
- **Tracking:** explain what is recorded; keep UTM details and expiry subordinate to the main creation task.
- **Library:** make edit, duplicate, pause, download, and the tracking link easy to find. Status must reflect expiry as well as active/paused state.
- **Analytics:** show real visits and real empty states. Make period and code selection explicit. Never invent sample numbers to fill a chart.

On narrow screens, keep editing and preview/save directly accessible through the Edit / Preview & save switch. Preserve the current draft when switching panes.

Keep one clear primary action in each panel. Avoid ornamental stat cards, repeated feature claims, decorative hero sections, and marketing copy inside the workflow. A heading such as “Create a QR code” is more useful than a slogan. Descriptions should explain a decision or consequence; remove text that merely restates the heading.

## State and wording

An unsaved preview encodes the destination directly. A saved/exported dynamic code encodes its permanent tracking link. Label this distinction visibly so a preview cannot be mistaken for a tracked code. Saving and exporting are separate actions. Export only the saved state; disable exports while there are unsaved edits. Save failures must leave the input intact. Warn before navigating away from unsaved work.

Use “scan” as a convenient label, with the meaning “tracking-link visit” available where reports are interpreted. Do not claim precise location, unique people, guaranteed scannability, or confirmed orders. “High error correction” describes a setting; “print-ready” must not replace a real scan test.

During private review, state that event attendees need preview access. Do not imply that a private deployment is ready for public materials. Never regenerate a slug when editing, and warn before deleting a code whose printed copies will stop working.

## Review a visual change

Review the running UI at a desktop width, a narrow laptop width, and a phone width. Check the complete flow, not just a polished first screen:

1. New code, invalid input, saved code, and edited destination.
2. Design controls with a real uploaded logo, gradients, and a long caption.
3. Empty and populated library, filters with no matches, pause/expiry, and deletion.
4. Empty and populated analytics, long names, unknown geography, and export labels.
5. Sign-in, confirmation/error states, loading, and network failure.

Confirm keyboard focus, label association, readable contrast, touch targets, and absence of horizontal overflow. Keep downloads consistent with the preview and decoder-test representative styled exports. Finish with a concise audit: issue, user consequence, severity, and proposed fix. Separate observed defects from future product suggestions.
