# WV-ROAD-003: Anchored curves, all-structure access, crossing intersections and desire paths

## Requirements and tests

| AC | Requirement | Tests |
| --- | --- | --- |
| 01 | On hold-and-drag, the touch-down position is a fixed node; dragging cannot move it. | Unit: radial anchor; browser fixed endpoint |
| 02 | Radial control sits opposite the finger. Greater drag distance increases radius; changing direction rotates the handle. | Unit: radial geometry |
| 03 | A new road may cross the interior of a built road. Both edges are split into a shared, persistent intersection with four arms. | Unit: crossing; browser crossing |
| 04 | Two new free-standing streets can intersect, even if neither originally connects to the town. | Unit: independent-street crossing |
| 05 | Roads with no existing intersection/end-point are permitted and warn about lack of direct sim access. | Unit: orphan road; browser toast |
| 06 | After monthly simulation, sims gradually create a dashed walking desire path to disconnected roads. It is not a built road or an industrial supply route. | Unit: desire-path growth and persistence; browser next month |
| 07 | Every house and structure is subject to road connectivity; no road access reduces home taxes and satisfaction. | Unit: housing tax; browser warning |
| 08 | Parks, plazas, farms, and industries use shared access rules. | Unit: park/plaza and existing industry regressions |
| 09 | Curves, intersections, road nodes, saves and reloads preserve user-authored topology. | Unit: save migration; existing browser reload tests |

## Road creation modes

1. Extend an existing road from a selected built node.
2. Create a fresh road that physically crosses a built road, automatically generating an intersection node. Future controls (stop sign, traffic light, roundabout) are **backlog only**, not part of the current simulation.
3. Create a new road disconnected from existing infrastructure. It is permitted with a visible warning; desire paths emerge gradually from pedestrian travel. It stays disconnected for industrial delivery purposes.

## Interaction contract

- Tap selects/places a fixed node for a straight segment.
- Hold at the desired new node until the mode prompt changes, then drag. The anchored node never moves.
- Curve handle equals `anchor - (finger - anchor)`, clamped inside the map. Finger direction is inverted for the visible curve point. Holding the first node defines a handle for the next segment.
- Existing road-node Extend/Destroy, editable built curves and undo remain available.
- Single-finger quick movement pans; two-finger pinch zooms.
- Build commits the network. Draft state has no lasting impact.

## Regression and release

- Test the entire Node suite, not just new tests, plus the full Playwright portrait browser suite.
- Real iPhone Duo portrait acceptance required before promotion to `main`.
- Production game and saves remain unchanged on the `main` branch.
- Desire paths are approximated route geometry, not simulated individual pedestrian agents yet.
