# WV-ROAD-002: Existing road network, junction demolition, one-action curves

## Problem

The starter road already carries traffic and production access, but was previously represented as an uneditable rendered path. The player wants built junctions, branching intersections, selective destruction, and persistent control over curves. Each change should have observable simulation consequences.

## Acceptance criteria

| ID | Observable behavior | Automated coverage |
| --- | --- | --- |
| AC-01 | Original road loads as real, selectable nodes and connected edges. | Unit AC-01, browser original-node test |
| AC-02 | Existing node tap offers Extend / Destroy. Extending shares that exact junction. | Unit AC-02, browser node sheet |
| AC-03 | Destroying a junction or edge is free with no refund, can disconnect industry, and reconnecting restores access. | Unit AC-03, browser demolition |
| AC-04 | New road can begin/end at built nodes, forming real intersections and preserving straight default. | Unit AC-04, browser branching |
| AC-05 | Hold and drag an endpoint in one gesture to create a segment. A bowed gesture or offset control point produces an editable curve; tap remains straight. | Unit AC-05, browser one-gesture test |
| AC-06 | Built curve retains control geometry; orange control handle can be adjusted; straighten or delete available without refund. | Unit AC-06, browser handle gesture |
| AC-07 | Tap a built segment to insert a new node and extend another road from that junction. | Unit AC-07, browser split test |
| AC-08 | Existing v1 saves load and migrate to an editable network without deleting progress. | Unit AC-08 |
| AC-09 | Network survives saving, reloading, and subsequent demolition. Preview save remains independent from stable. | Unit AC-09, browser reload |
| AC-10 | Initial village entrance remains protected to anchor the reachable-road system. | Unit AC-10 |

## Interaction notes

- New road: first tap places an anchor. Next tap creates a straight edge. Hold on the map for about 360 ms and drag to create the next segment and its optional curve before lifting your finger.
- Existing node: tap to open actions. You can start branching or delete the junction and its connected segments.
- Existing edge: tap to insert an intersection or delete the edge.
- Existing curved edge: orange midpoint is selectable and long-press draggable. During drag the curve previews; releasing commits the adjustment.
- Road removal has no immediate cost or refund; unreachable industries cease production until reconnected.
- The initial gateway cannot be deleted in this iteration because it anchors network connectivity.
- In-progress draft remains undoable and only becomes a built road on Build.

## Regression risks

Road saving, pre-existing v1 worlds, access to industry, monthly resource generation, curved road price, node tapping vs panning, two-finger pinch, short taps, deleting incident edges, browser refresh and dev/production save isolation.

## Required human device acceptance (iPhone Duo inner display portrait)

- [ ] Junctions visibly appear on original road.
- [ ] Tap a junction, choose Extend, draw a new branch to another junction.
- [ ] Press and hold a point to shape a segment in one continuous drag.
- [ ] Edit an orange curve handle on an already built road.
- [ ] Destroy a junction, verify no refund and subsequent industry disruption.
- [ ] Reconnect the affected industry and verify recovery.
- [ ] Pan and pinch without accidental nodes or changes.
- [ ] Reload, confirm that new and legacy road connections persist.

## Limitations and follow-ups

- The original entrance gateway cannot be deleted yet.
- Existing v1 roads made from sampled curves migrate to multiple short segments, preserving their geometry. Future save migrations may optimize curve fitting.
- This browser implementation approximates real road routing using graph reachability plus a nearby-road threshold. Vehicles and exact delivery routes remain future work.
