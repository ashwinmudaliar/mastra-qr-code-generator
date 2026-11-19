# Design audit — private review

## 2026-11-18 independent review and redesign

An independent review of `codex/initial-studio` at `0af04fa` found the earlier readability pass had measured only phone widths (320–430 px). At 1440 and 1100 px the screens kept 8–11 px labels (28 text elements under 12 px on Create, 162 on Analytics) and 9–15 text/background pairs under 4.5:1. On top of that sat a layer that carried no state: a sidebar with a workspace year, a breadcrumb repeating the heading, two avatars, a footer, icon tiles and subtitles on every heading, and the same caveat in four or five places. Analytics ran 3,046 px on desktop and about 5,500 px on a phone, with book requests starting about 2,250 px down.

The redesign keeps every behavioural rule (explicit save, saved-only export, stable slugs, archive history, last-good fulfillment reports) and rebuilds the presentation around two destinations, Codes and Results. [DESIGN.md](DESIGN.md) holds the resulting rules.

| Priority | Finding | Consequence | Resolution |
| --- | --- | --- | --- |
| High | An unsaved preview encoded the destination directly, marked only by an 8 px “Draft” pill. | A screenshot or early print sent people to Books with no scan or attribution, and its module density differed from the saved artwork. | Drafts encode `/q/draftpreview` (same length as a real link), which explains that the code is unsaved; a band on the artwork blocks scanning from the screen. |
| High | Desktop and laptop text was 8–11 px with `#666`/`#777` text. | The main working surface was hard to read; the measurement only covered phones. | One type scale at every width with a 12 px floor and `#939393` minimum. Measured after the change: 0 text elements under 12 px and 0 contrast failures at all six widths. |
| High | Saving from the phone Preview pane with no name failed silently. | The error rendered above the viewport and the field was in the hidden pane. | Field-level errors; a failed save closes the sheet, scrolls to the field and focuses it. |
| High | The sticky Edit / Preview switch pinned at 104 px while the nav it sat under scrolled away. | The switch floated over the field being edited. | Replaced by a fixed bottom bar (thumbnail and primary action) and a bottom-sheet artwork panel. |
| Medium | Logo and dot-style button groups were wrapped in `<label>`. | Clicking the words “Center logo” switched the logo to Mastra; the first button's name was “Center logo Mastra No logo Your logo”. | Button groups use `fieldset` and `legend`. |
| Medium | Analytics told the story out of order and in mixed units. | Scans, then fulfillment, then scan geography; “Delivered orders” beside “Books shipped”. | Outcome row first with a unit on every number, one comparison table for scans and requests, geography panels side by side. |
| Medium | A renamed event appeared twice, in different sections. | Scans and requests for the same event couldn't be read together. | Requests under an earlier label are nested under the event's current label. |
| Medium | Library actions were 22 px icons and a `<select>` used as a menu; pausing had no undo; destination and requests were not shown. | Routine actions were cramped, and a mis-tap broke printed codes at a live event. | 36–44 px targets, a keyboard-operable menu, Undo after pausing, destination and requests columns, rows grouped by event. |
| Medium | Expired codes used the green Active pill. | Status was misread. | Status colour follows the displayed state. |
| Low | Delete button text was 3.3:1 on red. | Hard to read. | Outline danger style. |

New capability: print-at-home sticker sheets for 3″ square labels, six per Letter sheet (PLS451 / Avery 94101 layout), with skip-used-labels, a remembered printer offset and an alignment test page. Unit tests cover the layout, offsets, PDF output and a decode of a full-size label for plain and framed designs; a browser check decoded every printed label of a generated sheet at its offset position.

Evidence and limits: measurements and screenshots came from local review mode with browser fixtures for fulfillment states. The protected hosted previews were not reachable from the review environment. Nothing was printed on label stock or scanned with a physical phone; the alignment test is the first-print check.

## 2026-11-17 review

Reviewed 2026-11-17 against [Mastra's kitchen sink](https://mastra.ai/dev/kitchen-sink) and the requested event/book workflow. The goal is a useful production tool: enter a destination, brand the artwork, save a stable link, export it, then compare actual visits.

### Verdict

The first pass needed more than a theme change. It contained decorative copy, weak action hierarchy, and controls that implied a more complete product than they delivered. The revised interface uses Mastra's typography and dark palette, but the larger improvement is behavioral: saving is explicit, reports use real data, and limitations appear at the decision that they affect.

The app is ready for private review without an app account. A persistent single-user workspace sits behind Vercel's private access check; the mobile editor separates editing from preview so the main action stays reachable. Public event release still requires a permanent scan domain and an explicit access/security decision. Account login remains deferred at the user's request.

### Findings and changes

| Priority | Finding | Consequence | Resolution |
| --- | --- | --- | --- |
| High | Export could implicitly save an edited destination. | Downloading artwork could unexpectedly change where existing printed codes lead. | Saving and exporting are separate. Downloads require a saved code with no unsaved edits. |
| High | Private preview restrictions appeared too late. | A user could print a link that attendees cannot open. | A visible notice sits above the primary save/download action; the scan origin is shown with export settings. |
| High | Leaving the editor could discard work. | Logo, destination, and design edits were lost. | In-app discard confirmation and browser unload protection. |
| High | Mobile preview and Save followed a very long settings form. | A central task required excessive scrolling. | An Edit / Preview switch keeps both destinations directly accessible. |
| Medium | The first pass used a cream theme and generic decorative language. | The workspace did not feel like Mastra and obscured the task. | Greed Standard, Commit Mono, dark neutral surfaces, green actions, literal headings, and shorter help text. |
| Medium | Event and book labels were collected without useful comparisons. | Users could not answer which event or book campaign performed best. | Event filtering, code/event/book comparisons, numeric chart labels, and an exact daily-count table. |
| Medium | “Book” and “templates” implied fulfillment selection and saved reusable templates. | Users could infer behavior that was absent. | “Book label” explains its reporting role; “Style presets” describes the four built-in designs. |
| Medium | Preset buttons showed identical generic icons; logo controls were buried. | Appearance choices were hard to compare and the requested logo feature was hard to find. | Real miniature QR previews; logo controls immediately after presets. |
| Medium | Optional tabs were presented as numbered required steps. | The user was pushed through settings they might not need. | Removed step numbering. Content, Design, and Tracking remain directly selectable. |
| Medium | Dialog and tab keyboard behavior was incomplete. | Keyboard users could lose focus or navigate unpredictably. | Roving tab focus, arrow/Home/End navigation, delete-dialog focus trapping, Escape, and focus restoration. |
| Medium | A browser-origin mismatch blocked saving on loopback review. | The page looked functional but the main action failed. | Corrected origin validation and covered the real browser save flow. |
| Medium | Presets duplicated a navigation destination and an editor control. | A simple styling choice appeared to require a separate workflow. | Folded presets into Design; primary navigation now contains Create, Your QR codes, and Scan analytics. |
| Medium | Advanced artwork and raw campaign controls were always visible. | Occasional settings added clutter and length to routine creation. | Advanced styling and campaign parameters start collapsed; all customization remains available and selected values persist when closed. |
| Medium | Save remained the strongest action after a successful save. | The next task, downloading, was visually secondary. | An unchanged saved code now offers Download PNG as its primary action, with SVG/PDF secondary. Editing restores Save changes and blocks downloads until saved. |
| Medium | Country, city, and device reports formed a long stack on phones. | Secondary breakdowns lengthened the mobile report without helping the main comparison. | A Country / City / Device selector shows one breakdown on mobile; desktop retains all three. Scans over time and event, book, and code comparisons stay outside the selector. |
| Medium | Mobile labels, status, filters, and secondary actions used 7–11 px text and dim colors. | People had to zoom or interpret low-contrast metadata to complete routine tasks. | Form controls use 16 px text, labels/body/help 14 px, and compact metadata 12–13 px, with brighter muted colors. Guide and auth screens follow the same rules. |
| Medium | Several icon actions, selectors, and toggles were smaller than a comfortable touch target. | Copying, exporting, filtering, and changing status were cramped on phones. | Controls have at least 44 px targets; presets/dot choices use two columns, library actions have their own row, and recent scans use a labelled mobile list. |
| Medium | Chart axis labels scaled down with the SVG. | Daily values became too small to read on phones. | Axis labels now use fixed-size text alongside the responsive plot; the exact daily-count table remains available. |
| High | Edits and draft navigation remained available while saving or processing a logo. | A delayed response could replace newer input or apply an upload to a different draft. | Temporarily disable editor controls and draft-changing navigation while work is pending; preserve mobile pane switching and recover after failed saves. |
| High | Pausing a code in the library did not update its retained editor. | A later destination save could silently reactivate the paused code. | Synchronize library status with retained editor and saved state. |
| Medium | Scan reports had no in-place refresh. | New visits stayed invisible while the report remained open. | A Refresh action fetches current counts with the selected filters intact. |

### Simplification follow-up

Applied the requested follow-up on 2026-11-17: presets now live only in Design, advanced styling and campaign settings start collapsed, and Download PNG becomes primary after saving. These changes preserve the customization options and the explicit save-before-export behavior. Mobile analytics now uses a Country / City / Device selector for one secondary breakdown at a time, while the chart and event comparisons remain visible. Book/code comparisons remain available, and desktop continues to show all three secondary breakdowns.

The final readability pass addresses the remaining small-text and cramped-control findings across mobile views. It raises text sizes and contrast, enlarges touch targets, gives dense controls room to wrap, and keeps chart labels independent of SVG scaling. Recent scans retain all their fields in a mobile list. Account setup remains deferred; visual inspection of the auth form does not verify signup or email confirmation.

### Evidence and limits

- On 2026-11-18, the full create/upload/save/reopen/export/destination/scan workflow passed on the protected hosted workspace without a Supabase Auth account or app login session. PNG, rendered SVG, and rendered PDF decoded to the hosted tracking link; two real visits appeared in desktop/mobile analytics. The test code and scans were removed. Unsigned page, session, codes, analytics, and scan requests all remained behind Vercel protection. Both existing account-owner and new private-workspace database access checks passed.

- Real browser checks cover saving, decoding the downloaded PNG's saved tracking link, SVG/PDF downloads, prevention of exporting unsaved changes, the code library, a recorded visit, reports, and desktop/mobile overflow.
- The final local end-to-end check uploads a real PNG through the file picker, saves and reopens it, downloads all three formats, changes the destination, and verifies that the original tracking link still redirects with campaign tags intact. Two actual link visits appear under the correct event and Mobile device category; exports and HEAD requests add no visits. The temporary code and its scan records are removed afterward.
- Independent artifact verification renders the actual SVG and one-page PDF, then decodes PNG/SVG/PDF to the same saved link. The SVG's embedded logo matches the normalized saved upload; visual review confirms the logo, purple gradient, frame, caption, and PDF margins. This final workflow runs in local review mode, where geography is Unknown, and does not test a physical phone camera or printed material.
- Focused browser regressions reproduce delayed-save/upload races, stale pause status, and missing report refresh. They verify locked pending controls, recovery after save failure, status preservation during destination edits, and refresh with unchanged filters. These tests use isolated browser responses without account or database changes.
- The simplification follow-up verifies three primary navigation destinations, keyboard operation and value retention in collapsed settings, Save/Download transitions after edits and reverts, and that downloads make no write requests. Desktop, narrow-laptop, and mobile captures show the collapsed editor and saved Download action without clipping or overlap.
- Mobile analytics checks switch Country / City / Device against the filtered report counts, preserve period/event/code filters, and verify that resizing restores all three desktop breakdowns. Reviewed phone, laptop, and desktop captures keep Scans over time and event/book/code comparisons outside the selector without overlap or clipping.
- The readability pass checks 40 viewport states at 320, 360, 390, and 430 px: create, design/advanced settings, tracking, preview, library, analytics, guide, sign-in, and sign-up. `scripts/audit-mobile.mjs` checks visible text against a 12 px minimum, enabled controls against a 44 px target, and page overflow; all 40 states passed. Independent image review also caught and corrected a narrow-preview gutter issue and a small auth eyebrow. The updated muted text color has about 6.3:1 contrast on the main panel surface.
- Sign-in/sign-up screens were reviewed visually with a mocked session response, without creating accounts or changing Auth configuration. These are viewport-based UI checks, not a claim of physical-device or comprehensive assistive-technology certification.
- Representative styles are decoder-tested, including logos, gradients, dot/corner combinations, caption frames, and quiet zones. This does not replace scanning a physical print with target phones under event lighting.
- Server checks cover persistent tracking slugs, destination changes, UTM handling, pause/resume, invalid URLs, cross-site writes, and scan classification. Hosted row-security checks verify owner isolation and anonymous denial.
- Browser audit captures and disposable exports live under ignored `outputs/design-audit/`; readability captures and measurements live under ignored `outputs/mobile-readability/`. These are not customer data or committed fixtures. Temporary test codes are removed after checks.
- Earlier hosted checks verified the retained account path using a disposable account; fixtures were removed. Email delivery and confirmation remain unverified. Supabase Auth URL/callback settings are needed when account login is introduced, not for the current account-free private workspace.
- No invented campaign metrics are used. “Scans” are tracking-link visits, not unique people or fulfilled book orders. Geography may be missing or inaccurate; the application stores no raw IP or precise GPS. Hosting-provider logs were outside this audit.
- Logo normalization accepts PNG/JPEG/WebP. Saved custom brand presets, shared team ownership, full-history scan exports, and fulfillment conversions are future work, not hidden paid features.

See [DESIGN.md](DESIGN.md) for the maintained visual rules, [ARCHITECTURE.md](ARCHITECTURE.md) for data behavior, and [MAINTENANCE.md](MAINTENANCE.md) for change and verification procedures.
