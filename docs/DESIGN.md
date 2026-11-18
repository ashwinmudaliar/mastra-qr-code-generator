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

Keep three primary navigation destinations: Create a QR code, Your QR codes, and Scan analytics. Style presets belong inside the editor's Design tab, not in a separate destination.

- **Create:** destination and a recognizable name first; optional event/book/placement labels afterward.
- **Design:** keep presets, logo selection/upload, and Code color visible. Put logo size, background/corner colors, gradients, shapes, and caption-frame controls inside an advanced section that starts collapsed. Expanding or collapsing it must preserve all selected values. Every control must change the actual exported image.
- **Tracking:** explain what is recorded; keep raw UTM fields inside an advanced campaign section that starts collapsed. Derive campaign/content defaults from event and placement. Expanding or collapsing settings must not change their values or disable tracking. Keep expiry subordinate to the main creation task.
- **Library:** make edit, duplicate, pause, download, and the tracking link easy to find. Archive replaces permanent deletion: the confirmation explains that printed links stop opening the destination while scan and fulfillment history remains. Hide archived codes in the default library and expose them through the Archived filter. Archived rows offer Restore and View analytics. Restoration keeps the original ID/link and returns the code paused; activating it is a separate action. Archived status takes precedence over expiry.
- **Analytics:** keep Scans over time and event comparisons visible. Preserve book and code comparisons as well. On phones, a Country / City / Device selector shows one secondary breakdown at a time; on desktop, show all three breakdowns together. The selector must not hide the chart or campaign comparisons, change their data, or reset the period/event/code filters. Show real visits and real empty states. Never invent sample numbers to fill a chart.
- **Fulfillment:** add a concise summary within Analytics, retaining the existing scan comparisons. Label preview results as simulated, expose test request controls through a link, and distinguish requests from book units. Shipping destinations are a separate breakdown from scan geography. Preserve the last successful report for matching filters during refresh failures; never turn an outage into zero results or show stale counts under new filters. Historical event labels remain selectable and visibly differ from current scan labels when relevant.

On narrow screens, keep editing and preview directly accessible through the Edit / Preview pane switch. Preserve the current draft when switching panes, and make the same save/download state visible on desktop and mobile.

Keep one clear primary action in each panel. The editor's primary action is Save for a new or changed code and Download PNG for an unchanged saved code; SVG and PDF remain secondary formats. Avoid ornamental stat cards, repeated feature claims, decorative hero sections, and marketing copy inside the workflow. A heading such as “Create a QR code” is more useful than a slogan. Descriptions should explain a decision or consequence; remove text that merely restates the heading.

## Mobile readability

At phone widths, make text and controls usable at the displayed scale rather than shrinking the desktop layout:

- Use 16 px text in editable inputs and selectors, 14 px for labels and body/help copy, and 12–13 px only for compact metadata. Action labels can use 13–14 px. Avoid the former 7–11 px operational labels.
- Keep primary and secondary controls at least 44 px tall, with 44 × 44 px targets for icon actions. Editable fields use at least 48 px height. Give controls space to wrap instead of reducing their text size.
- Use `#939393` or brighter for muted operational text on the dark surfaces. Review actual foreground/background pairs, including inactive controls, empty states, placeholders, and notes.
- Show short mobile navigation labels with the full accessible names. At 480 px and below, use two columns for preset and dot choices; keep library status and actions on separate rows and metric cards in one column.
- Use a readable labelled list for recent scans on mobile while retaining the desktop table. Preserve every record field; do not solve crowding by hiding information.
- Render chart axis labels as fixed-size text outside the scaling SVG, retaining the exact daily-count table. Labels must remain legible at narrow widths and with large counts.

Apply the same standards to the editor, preview/download controls, tracking, library, analytics, guide, dialogs, and sign-in/sign-up forms. Visual review of auth screens does not complete account setup or verify email delivery.

## State and wording

An unsaved preview encodes the destination directly. A saved/exported dynamic code encodes its permanent tracking link. Label this distinction visibly so a preview cannot be mistaken for a tracked code. Saving and exporting are separate actions. After a successful save, replace the primary Save action with Download PNG. Any further edit restores Save changes as primary; reverting every edit to the saved values restores Download PNG. Export only the saved state, block all formats while there are unsaved edits, and never perform a save as a side effect of downloading. Save failures must leave the input intact. Warn before navigating away from unsaved work.

While saving or processing a logo, disable edits and draft-changing navigation so completion cannot overwrite newer work. Keep the mobile Edit / Preview switch usable. A library pause/resume action must also update any retained editor state; changing a destination later must not undo the selected status. Analytics provides a Refresh action that preserves period, event, and code filters.

Use “scan” as a convenient label, with the meaning “tracking-link visit” available where reports are interpreted. Do not claim precise location, unique people, guaranteed scannability, or confirmed orders. “High error correction” describes a setting; “print-ready” must not replace a real scan test.

During private review, state that event attendees need preview access. Do not imply that a private deployment is ready for public materials. Never regenerate a slug when editing or restoring. Archived codes remain selectable in analytics, clearly labelled as archived, and remain included in historical totals.

## Review a visual change

Review the running UI at a desktop width, a narrow laptop width, and phone widths of 320, 360, 390, and 430 px. Inspect computed text sizes, contrast, and touch targets alongside screenshots; full-page captures alone can conceal microtype. Check the complete flow, not just a polished first screen:

1. New code, invalid input, saved code, and edited destination.
2. Design controls with a real uploaded logo, gradients, and a long caption.
3. Empty and populated library, filters with no matches, pause/expiry, archival, retained analytics, and restoration to paused.
4. Empty and populated analytics, long names, unknown geography, and export labels. On phones, switch Country / City / Device while keeping the chart and campaign comparisons available; on desktop, verify all three breakdowns remain visible.
5. Sign-in, confirmation/error states, loading, and network failure.

Confirm keyboard focus, label association, readable contrast, touch targets, and absence of horizontal overflow. Keep downloads consistent with the preview and decoder-test representative styled exports. Finish with a concise audit: issue, user consequence, severity, and proposed fix. Separate observed defects from future product suggestions.
