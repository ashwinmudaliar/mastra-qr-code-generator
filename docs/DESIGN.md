# Design

The interface follows [Mastra's kitchen sink](https://mastra.ai/dev/kitchen-sink). This is a utility for producing, printing and comparing codes, so every element on screen must help edit, check, export or compare a code. The 2026-11-18 redesign and its evidence are recorded in [the design audit](DESIGN-AUDIT.md).

## Rules

These rules apply to every screen. They replace per-screen prescriptions, which let the same caveat appear in four places and let desktop keep 8 px labels while phones were fixed.

1. Every sentence on screen changes a decision. If it restates its heading, delete it. No page subtitles, icon tiles on headings, eyebrows, breadcrumbs or footers.
2. Each caveat appears once, where the decision it affects is made: scan meaning and the books-to-requests unit in the Results footnote, approximate location on the scan-location panel, private preview in the top-bar chip and one line next to Download.
3. One type scale at every width. Nothing is smaller than 12 px; help and metadata use 13 px, interface text 14.5 px, phone inputs 16 px. Mono is for values only: URLs, hex codes, numbers in tables.
4. Borders and panels mark objects (the artwork, a data panel, a dialog). Form sections are separated by space and a hairline.
5. One primary action per screen, next to the thing it acts on.
6. Errors appear at the field that caused them, and the view moves there and focuses it.
7. Review at 1440 and 1100 px as well as 320/360/390/430 px, and record measured text size and contrast, not only screenshots (`scripts/audit-mobile.mjs` covers all six widths).

## Brand system

| Role | Token / value |
| --- | --- |
| Sans | Greed Standard variable; headings weight 520 / width 112 |
| Mono | Commit Mono; values only |
| Text | `#f0f0f0` primary, `#d9d9d9` body, `#939393` muted (the floor for any readable text) |
| Background / surfaces | `#020202`, `#0b0b0b` panels, `#141414` raised, `#111111` fields |
| Lines | `#222222`, `#2e2e2e` |
| Accent | `#7aff78` for the primary action and positive state only |
| Semantic | Amber `#fdac53` for preview notes and attention counts, red `#ff4758` / text `#ff8a94` for errors and destructive actions |
| Radii | 8 px controls, 16 px panels and dialogs |

Tokens live at the top of `app/globals.css`. Fonts load from the official Mastra host with system fallbacks; keep font binaries out of this public repository. The QR artwork is a separate object: it keeps its own light background, quiet zone and contrast whatever the interface theme.

## Structure

Two destinations in a 56 px top bar: **Codes** (home) and **Results**. Creating and editing are a view of Codes, reached from **New code** or a code's name. The private or local preview chip sits at the right of the top bar.

- **Codes:** grouped by event label, with destination, all-time scans, requests from the last 12 months (when fulfillment reporting is connected) and status (Active, Paused, Expired, Archived, each with its own colour). Row actions are Download PNG, Copy link and a menu: Edit, Duplicate, Sticker sheet…, Pause/Activate, View results, Archive…. Pausing shows a toast with Undo, because it breaks printed codes immediately. Archive keeps history: its dialog says printed copies stop opening, that scans and requests stay in Results, and offers Pause instead. Archived codes are hidden behind the Archived filter, where Restore returns them paused.
- **Editor:** one page. **Link** (destination, name, then event, placement and book label) and **Look** (presets, logo, colour) are always visible. **More styling**, **Tracking options** and **Create several codes** start collapsed, each showing a one-line summary of its current settings; opening or closing them never changes values. Code status sits in the title row once a code exists. The artwork panel holds the state line, the artwork, the tracking link, the one preview note, the primary action and the secondary formats.
- **Results:** filters (period, event including earlier labels, code), then one outcome row: Scans (link visits), Requests (form submissions), Books requested and Books shipped (copies), Delivered (requests, with untracked delivery noted) and Need attention (requests). Then Scans per day, one table comparing scans and book requests by Event, Code or Book (requests made under an earlier event label are nested under the event's current label), Where scans came from (Country/City/Device, approximate) beside Where books were sent (Country/City), and Recent scans collapsed with CSV export. Simulated preview results are tagged next to the numbers, with a link to the test requests.

## Phones

Below 761 px the artwork panel becomes a bottom sheet. A fixed bar keeps a live thumbnail (tap to open the sheet) and the primary action (Save or Download) in reach, so the form never competes with the preview for the same scroll position. Controls are at least 44 px tall and inputs 48 px with 16 px text. Codes become cards with scans, requests and status on one line; the comparison table becomes cards with every number labelled; recent scans become labelled rows. Toasts appear under the top bar so they never cover the action bar.

## State and wording

An unsaved code previews a placeholder tracking link (`/q/draftpreview`, the same length as a real slug), never the destination. The artwork carries a “Preview only · not a tracking link” band, so a draft can't be scanned from the screen, and the placeholder link explains that the code was printed from an unsaved preview. A saved code encodes its permanent tracking link.

Saving and exporting are separate. The primary action is Save code for a new code, Save changes for an edited one, and Download PNG for an unchanged saved one; reverting every edit restores Download PNG. All formats, including the sticker sheet, export only the saved state and are disabled while edits are unsaved; downloading never saves. Save failures keep the input. Leaving unsaved work asks first. While a save or logo upload is pending, the form and navigation are locked; the phone preview toggle stays usable.

Use “scan” for a tracking-link visit. Do not claim precise location, unique people, guaranteed scannability or confirmed orders. During private review, say that scanners need preview access and that the deployment isn't ready for printed event material. Never regenerate a slug when editing or restoring. Archived codes stay selectable in Results, labelled as archived, and stay in historical totals.

## Sticker sheets

The Sticker sheet download lays the saved artwork onto 3″ square labels, six per US Letter sheet (Premium Label Supply PLS451; the layout matches Avery 94101). The code fills each label inside a 1/16″ safety inset with its four-module quiet zone; non-white backgrounds bleed 1/16″ past the label edge. Used labels can be skipped, a printer offset (1/32″ steps, remembered on the device) corrects drift, and an alignment test page checks the layout on plain paper. Frames shrink the code, so the Print frame hint recommends no frame for stickers. Geometry lives in `lib/sticker-sheet.ts`; add a template there for other label stock.

## Review a visual change

Review the running UI at 1440, 1100, 430, 390, 360 and 320 px, measuring text size, contrast, touch targets on phones and horizontal overflow. Cover new, invalid, saved, edited and reverted codes; design controls with an uploaded logo, gradient and long caption; empty, filtered, paused, expired and archived codes; empty, populated, loading, failed-refresh and not-configured results with long names and earlier event labels; the sticker sheet dialog and its PDFs; and sign-in. Keep downloads consistent with the preview and decoder-test styled exports. Finish with a short audit: issue, consequence, severity, fix, with observed defects kept separate from suggestions.
