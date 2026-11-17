# Design audit — private review

Reviewed 2026-11-17 against [Mastra's kitchen sink](https://mastra.ai/dev/kitchen-sink) and the requested event/book workflow. The goal is a useful production tool: enter a destination, brand the artwork, save a stable link, export it, then compare actual visits.

## Verdict

The first pass needed more than a theme change. It contained decorative copy, weak action hierarchy, and controls that implied a more complete product than they delivered. The revised interface uses Mastra's typography and dark palette, but the larger improvement is behavioral: saving is explicit, reports use real data, and limitations appear at the decision that they affect.

The desktop is ready for private design review. The mobile editor separates editing from preview/save so the main action is reachable without scrolling through every customization control. Public event release still requires a permanent scan domain, publicly reachable scan links, and completed account/email setup.

## Findings and changes

| Priority | Finding | Consequence | Resolution |
| --- | --- | --- | --- |
| High | Export could implicitly save an edited destination. | Downloading artwork could unexpectedly change where existing printed codes lead. | Saving and exporting are separate. Downloads require a saved code with no unsaved edits. |
| High | Private preview restrictions appeared too late. | A user could print a link that attendees cannot open. | A visible notice sits above Save; the scan origin is shown with export settings. |
| High | Leaving the editor could discard work. | Logo, destination, and design edits were lost. | In-app discard confirmation and browser unload protection. |
| High | Mobile preview and Save followed a very long settings form. | A central task required excessive scrolling. | An Edit / Preview & save switch keeps both destinations directly accessible. |
| Medium | The first pass used a cream theme and generic decorative language. | The workspace did not feel like Mastra and obscured the task. | Greed Standard, Commit Mono, dark neutral surfaces, green actions, literal headings, and shorter help text. |
| Medium | Event and book labels were collected without useful comparisons. | Users could not answer which event or book campaign performed best. | Event filtering, code/event/book comparisons, numeric chart labels, and an exact daily-count table. |
| Medium | “Book” and “templates” implied fulfillment selection and saved reusable templates. | Users could infer behavior that was absent. | “Book label” explains its reporting role; “Style presets” describes the four built-in designs. |
| Medium | Preset buttons showed identical generic icons; logo controls were buried. | Appearance choices were hard to compare and the requested logo feature was hard to find. | Real miniature QR previews; logo controls immediately after presets. |
| Medium | Optional tabs were presented as numbered required steps. | The user was pushed through settings they might not need. | Removed step numbering. Content, Design, and Tracking remain directly selectable. |
| Medium | Dialog and tab keyboard behavior was incomplete. | Keyboard users could lose focus or navigate unpredictably. | Roving tab focus, arrow/Home/End navigation, delete-dialog focus trapping, Escape, and focus restoration. |
| Medium | A browser-origin mismatch blocked saving on loopback review. | The page looked functional but the main action failed. | Corrected origin validation and covered the real browser save flow. |

## Further simplification worth considering

1. **Fold Style presets into Design.** Presets already appear in the editor; removing their separate navigation destination would leave three primary tasks: Create, Your QR codes, and Scan analytics.
2. **Hide advanced design controls initially.** Keep preset, logo, and primary color visible. Put gradients, corner details, and caption-frame options in an expandable section, without removing customization.
3. **Make campaign tags an advanced option.** Generate sensible tags from the event and placement; show the four raw UTM fields only when the user wants to override them.
4. **Reduce the mobile report stack.** Keep visits over time and event comparison visible; use a selector for country, city, and device breakdowns.
5. **De-emphasize Save after a successful save.** An unchanged saved code still has an enabled green Save button. A neutral saved state would make downloading the obvious next action.
6. **Review secondary text at actual device scale.** Some metadata remains compact. Before a wider rollout, test narrow screens and browser zoom with real users rather than judging only full-page captures.

These are product recommendations, not claims that the corresponding features are implemented. The current build retains the full controls so the requested customization can be evaluated.

## Evidence and limits

- Real browser checks cover saving, decoding the downloaded PNG's saved tracking link, SVG/PDF downloads, prevention of exporting unsaved changes, the code library, a recorded visit, reports, and desktop/mobile overflow.
- Representative styles are decoder-tested, including logos, gradients, dot/corner combinations, caption frames, and quiet zones. This does not replace scanning a physical print with target phones under event lighting.
- Server checks cover persistent tracking slugs, destination changes, UTM handling, pause/resume, invalid URLs, cross-site writes, and scan classification. Hosted row-security checks verify owner isolation and anonymous denial.
- Screenshots and disposable exports are generated locally under ignored `outputs/design-audit/` by `scripts/audit-ui.mjs`; they are not customer data or committed fixtures. Temporary test codes are removed after checks.
- Hosted checks verified password sign-in, persistent cookie sessions, owner-scoped create/read/update/delete, and a real redirect recorded in analytics using a disposable account. Fixtures were removed. Email delivery and confirmation remain unverified; Supabase Auth Site URL and callback allowlist must match the review deployment.
- No invented campaign metrics are used. “Scans” are tracking-link visits, not unique people or fulfilled book orders. Geography may be missing or inaccurate; the application stores no raw IP or precise GPS. Hosting-provider logs were outside this audit.
- Logo normalization accepts PNG/JPEG/WebP. Saved custom brand presets, shared team ownership, full-history scan exports, and fulfillment conversions are future work, not hidden paid features.

See [DESIGN.md](DESIGN.md) for the maintained visual rules, [ARCHITECTURE.md](ARCHITECTURE.md) for data behavior, and [MAINTENANCE.md](MAINTENANCE.md) for change and verification procedures.
