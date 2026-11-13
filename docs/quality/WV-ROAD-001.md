# WV-ROAD-001: Straight-by-default roads, intentional curves

**Player problem:** The old road editor rounded each tap automatically. Road geometry should follow the player's intent.

| ID | Acceptance | Automated test |
| --- | --- | --- |
| AC-01 | Taps add straight line segments. | road-editor.test.mjs AC-01 |
| AC-02 | Multiple taps keep corners sharp. | AC-02 |
| AC-03 | Hold unfinished segment ~360 ms and drag to bend it. | AC-03, AC-05 |
| AC-04 | Repeated drag refines one curve without altering its neighbors. | AC-04 |
| AC-05 | A quick swipe pans; pinch still zooms. | AC-05 |
| AC-06 | Preview renders explicit Q or L geometry. | AC-06 |
| AC-07 | Curved length affects cost, Undo reverts last action, Cancel clears. | AC-07 |
| AC-08 | Confirmed geometry persists, impacts simulation, and v1 saves load. | AC-08 |

## Real-device acceptance checklist

- [ ] Three taps draw straight roads with a sharp angle.
- [ ] Press and hold a draft segment, drag to bend it, and release.
- [ ] Bend the same segment again without modifying others.
- [ ] Quick swipes pan and two-finger pinch zooms.
- [ ] Stationary long-press adds no unintended node.
- [ ] Undo reverses the last edit, Cancel discards the draft.
- [ ] Road cost changes with curvature and Build commits the previewed shape.
- [ ] Refresh retains finished roads and treasury.
- [ ] Stable progress is unaffected by development testing.

## Known limitations

- Curves are stored as sampled line segments in the existing v1 save format.
- Existing roads remain loadable, but old automatically smoothed display segments now render straight.
- Editing a road after it has already been built remains out of scope.
