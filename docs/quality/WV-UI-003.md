# WV-UI-003 — Compact cartography UI and dialog layout

## User feedback (iPhone Duo screenshot, 2026-10-28)

The construction dialog was oversized, the Build and Cancel buttons sat too close and were not aligned, body copy was too pale, and the kit felt like a modern application rather than the warm/rustic cartography direction chosen for Willow Valley.

## Acceptance criteria

| ID | Requirement | Verification |
| --- | --- | --- |
| AC-01 | Construction dialog targets 80% of viewport width, capped at 344 CSS px rather than 430 px, and uses smaller 13–24px type. | Browser geometry checks at 320, 390, 600 px viewport widths |
| AC-02 | Build and Cancel are side-by-side in a two-column row, same top/bottom edges and heights, >=8px apart. | Browser `boundingBox` assertions |
| AC-03 | Both controls retain a >=44px finger target despite more compact visual density. | Browser geometry checks |
| AC-04 | Body text is dark legible ink, not washed-out light gray-green. | Browser computed-color assertion |
| AC-05 | Rustically styled parchment, fine etched lines, decorative compass, hand-drawn road, house, map and tree icons, restrained corners and ink borders are consistent with the Kenney Cartography reference. | DOM/CSS coverage, design review on iPhone |
| AC-06 | Shared `createDialogActions` and `createSheetPreview` used in actual catalog, while the real game build sheet consumes the same rustic style tokens. | Browser shared palette/border and existing parity tests |
| AC-07 | No new dependencies or network calls; PWA cache and offline package still work. Existing road, economic, and saved-game regression tests continue passing. | Full Node and Playwright suite |
| AC-08 | Stable remains unchanged until player approves Development on physical iPhone Duo. | Branch and deploy policy |

## Art origin and boundaries

- Base colors stay Authentic Teal `#035352` and Sidecar Yellow `#F3E8BC`.
- Design motifs are *original*, hand-inked SVG icons informed by Kenney Cartography's style, rather than direct copies of its icons. The third-party Cartography Pack assets have **not** been imported into this iteration.
- Only interface components receive the rustic materials; the in-world buildings, terrain and models keep their separately selected game-asset colors.
- Do not CSS-transform the whole dialog to 80% (that would shrink touch targets). Physically reduce dimensions, spacing and typography and preserve >=44px targets.

## Physical device acceptance

- [ ] In Development UI Kit, open Construction at iPhone Duo portrait size.
- [ ] Verify label and body contrast, visually equal action controls, and adequate finger space.
- [ ] Compare screenshot with approved art direction; assess authenticity of parchment/ink motifs.
- [ ] Inspect actual game Build menu for consistent material style and no cramped row controls.
- [ ] Open app offline; modal and glyph assets must not cause new requests.
