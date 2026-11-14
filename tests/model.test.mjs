import test from "node:test";
import assert from "node:assert/strict";
import { baseline, connectNetworkRoad, curve, isLaneDrop, junctionMovements, mergeTaper, moveNetworkNode, moveRoadLaneAnchor, networkLaneSamples, networkNodes, networkRoadGeometry, nextNetworkNode, normalizeDesign, pointOnCurve, removeNetworkRoad, roadCurveFromPull, splitNetworkRoad, starterNetwork, validate } from "../model.mjs";
import { applyRoadJoin, commitRoadDraft, curveHandleControls, editNetworkCurve, freeformBendControls, junctionLanePose, junctionLegs, laneAnchoredCurve,
  levelStart, levels, levelTrips, networkLaneWidth, previewRoadDraft, roadDraftControls, roadJoinDraft, roadSurfaceSamples, shiftNetworkRoad, tripTerminals } from "../model.mjs";

test("a lane-bound curve keeps its preview shape and slides its handle along the lane", () => {
  const network = starterNetwork();
  const fork = { id: "j3", x: 270, y: 250, control: "priority" };
  const merge = { id: "j4", x: 370, y: 180, control: "priority" };
  const first = splitNetworkRoad(network, 3, fork, 70 / 147).network;
  const second = splitNetworkRoad(first, 2, merge, 100 / 200).network;
  second.roads.find(road => road.a === "j3" && road.b === "j2").backward = 2;
  const nodes = networkNodes(second);
  const incoming = junctionLegs(second, fork.id).find(leg => leg.neighbor === "j2");
  const outgoing = junctionLegs(second, merge.id).find(leg => leg.neighbor === "east");
  const points = [
    { id: fork.id, ...junctionLanePose(incoming, nodes, "incoming", 0, 22), anchor: { neighbor: "j2", lane: 0 } },
    { id: merge.id, ...junctionLanePose(outgoing, nodes, "outgoing", 0, 22), anchor: { neighbor: "east", lane: 0 } }
  ];
  const controls = [[270, 218, 325, 180]];
  const preview = previewRoadDraft(second, points, { forward: 1, backward: 1 }, controls);
  const result = commitRoadDraft(second, points, { forward: 1, backward: 1 }, controls);
  assert.ok(result.network, result.issue);
  const graph = result.network, built = graph.roads.at(-1), builtNodes = networkNodes(graph);
  const original = laneAnchoredCurve(built, graph, builtNodes);
  const before = roadSurfaceSamples(preview.roads[0], preview.graph, preview.nodes);
  assert.deepEqual(roadSurfaceSamples(built, graph, builtNodes), before);
  const entry = junctionLanePose(incoming, nodes, "incoming", 0);
  const exit = junctionLanePose(outgoing, nodes, "outgoing", 0);
  assert.equal(original.start.angle, entry.angle);
  assert.equal(original.end.angle, exit.angle);
  const nextControls = curveHandleControls(built, graph, builtNodes, 0, { x: original.a.x + 16, y: original.a.y - 7 });
  const adjusted = editNetworkCurve(graph, graph.roads.length - 1, nextControls);
  assert.ok(adjusted.network, adjusted.issue);
  const next = laneAnchoredCurve(adjusted.network.roads.at(-1), adjusted.network, networkNodes(adjusted.network));
  assert.equal(next.start.angle, original.start.angle);
  assert.equal(next.end.angle, original.end.angle);
  assert.notEqual(next.a.y, original.a.y);
  assert.ok(Math.abs(next.a.x - original.a.x) < .0001);
  const slide = roadJoinDraft(graph, graph.roads.length - 1, "a", { x: 285, y: 270 });
  const slid = applyRoadJoin(graph, slide);
  assert.ok(slid.network, slid.issue);
  const moved = networkNodes(slid.network).get(fork.id);
  assert.ok(Math.abs(moved.x - fork.x) < .0001);
  assert.ok(Math.abs(moved.y - 270) < 1);
  assert.deepEqual(slid.network.roads.at(-1).laneA, built.laneA);
  assert.equal(networkNodes(graph).get(fork.id).y, 250);
});

test("the fixed-width road surface rejects a bend where the inside lanes would fold over", () => {
  const points = [{ x: 70, y: 495 }, { x: 115, y: 453 }];
  const controls = [[100, 495, 114.5, 453.2]];
  const network = { nodes: [], roads: [] };
  const lanes = { forward: 3, backward: 3 };
  assert.match(previewRoadDraft(network, points, lanes, controls).issue, /too tight/);
  assert.match(commitRoadDraft(network, points, lanes, controls).issue, /too tight/);
  assert.deepEqual(network, { nodes: [], roads: [] });
});

test("the five levels supply independent layouts and valid routes with fixed demand", () => {
  assert.equal(levels.length, 5);
  const starts = levels.map(level => levelStart(level.id));
  assert.equal(new Set(starts.map(start => JSON.stringify(start.network))).size, levels.length);
  for (const [index, level] of levels.entries()) {
    const design = starts[index];
    assert.ok(validate(design), level.id);
    const trips = levelTrips(level.id, design);
    assert.deepEqual(trips, levelTrips(level.id, design));
    assert.ok(trips.every(trip => tripTerminals(trip).every(Boolean)));
    assert.equal(new Set(trips.map(trip => trip.id)).size, trips.length);
    assert.deepEqual(design, levelStart(level.id));
  }
});

test("complex roads go through the break with a shared tangent and an independent end angle", () => {
  const layouts = [
    { points: [[50, 485], [105, 445], [125, 397]], middle: [1, -1, 24], end: [-.1, -1, 26] },
    { points: [[70, 495], [125, 454], [175, 405]], middle: [1, 2, 50], end: [0, -1, 44] },
    { points: [[62, 478], [123, 447], [183, 402]], middle: [1, .8, 50], end: [-1, -1, 43] },
    { points: [[64, 488], [110, 443], [157, 395]], middle: [1, -1, 22], end: [1, -1, 30] }
  ];
  for (const { points, middle, end } of layouts) {
    const anchors = points.map(([x, y]) => ({ x, y }));
    const tangent = ([x, y, reach]) => ({ x, y, reach });
    const controls = roadDraftControls(anchors, [undefined, tangent(middle), tangent(end)]);
    const result = commitRoadDraft({ nodes: [], roads: [] }, anchors, { forward: 1, backward: 0 }, controls);
    assert.ok(result.network, result.issue);
    const nodes = networkNodes(result.network);
    const [first, second] = result.network.roads.map(road => networkRoadGeometry(road, nodes));
    assert.deepEqual(first.end, second.start);
    assert.deepEqual([first.end.x, first.end.y], points[1]);
    assert.ok(Math.abs(first.samples.at(-1).angle - second.samples[0].angle) < 1e-8);
    assert.ok(Math.abs(second.samples.at(-1).angle - Math.atan2(end[1], end[0])) < 1e-8);
    assert.equal(validate({ ...baseline, network: result.network }), true);
  }
});

test("a held freeform span follows the drag while the staged chain commits atomically", () => {
  const a = { x: 65, y: 491 }, b = { x: 125, y: 465 }, c = { x: 180, y: 444 };
  const controls = freeformBendControls(a, b, { x: 0, y: 18 });
  const network = { nodes: [], roads: [] };
  const next = commitRoadDraft(network, [a, b, c], { forward: 1, backward: 0 }, [controls]);
  assert.ok(next.network, next.issue);
  const nodes = networkNodes(next.network);
  const middle = networkRoadGeometry(next.network.roads[0], nodes).samples[50];
  assert.ok(Math.abs(middle.x - (a.x + b.x) / 2) < 1e-8);
  assert.ok(Math.abs(middle.y - (a.y + b.y) / 2 - 18) < 1e-8);
  assert.equal(next.network.roads[1].controls, undefined);
  assert.ok(commitRoadDraft(network, [a, b, { x: 100, y: 200 }], { forward: 1, backward: 0 }, [controls]).issue);
  assert.deepEqual(network, { nodes: [], roads: [] });
});

test("a segment shift keeps its junctions, offsets the lane geometry, and aligns through movements", () => {
  const network = starterNetwork();
  network.roads[0] = { ...network.roads[0], forward: 2 };
  network.roads[3] = { ...network.roads[3], forward: 2 };
  const control = network.nodes[0];
  const through = graph => junctionMovements(graph, control).find(move => move.from === "north" && move.to === "j2" && move.fromLane === 0);
  assert.equal(through(network).toLane, 0);
  const shifted = shiftNetworkRoad(network, 3, 1);
  assert.ok(shifted.network, shifted.issue);
  assert.equal(shifted.network.nodes, network.nodes);
  assert.equal(through(shifted.network).toLane, 1);
  const center = graph => networkLaneSamples(graph.roads[3], graph, networkNodes(graph), true, 0)[10].x;
  assert.ok(Math.abs(center(network) - center(shifted.network) - networkLaneWidth) < .1);
  assert.equal(junctionLegs(shifted.network, "j1").length, junctionLegs(network, "j1").length);
  assert.equal(validate({ ...baseline, network: shifted.network }), true);
});

test("an extra lane tapers by default and can branch to a specific receiving lane", () => {
  let network = starterNetwork();
  const split = (index, x, y, t) => {
    const result = splitNetworkRoad(network, index, nextNetworkNode(network, { x, y }), t);
    assert.ok(result.network, result.issue);
    network = result.network;
  };
  split(3, 270, 250, 70 / 147);
  split(2, 338, 180, 68 / 200);
  network.roads[5] = { ...network.roads[5], backward: 2 };
  network.roads[3] = { ...network.roads[3], forward: 2 };
  const [drop, exit] = network.nodes.slice(-2);
  const approaches = graph => junctionMovements(graph, drop).filter(move => move.from === "j2");
  assert.equal(isLaneDrop(network, drop), true);
  assert.deepEqual(approaches(network).map(move => [move.fromLane, move.to, move.toLane]), [[0, "j1", 0], [1, "j1", 0]]);
  const taper = networkLaneSamples(network.roads[5], network, networkNodes(network), false, 0);
  assert.ok(taper.at(-1).x < taper.at(-6).x);

  const slip = { a: drop.id, b: exit.id, forward: 1, backward: 0, bend: 0,
    laneA: { neighbor: "j2", lane: 0 }, laneB: { neighbor: "east", lane: 0 }, controls: [270, 215, 306, 180] };
  const branch = connectNetworkRoad(network, slip);
  assert.ok(branch.network, branch.issue);
  assert.ok(validate({ ...baseline, network: branch.network }));
  assert.deepEqual(approaches(branch.network).map(move => [move.fromLane, move.to, move.toLane]), [[1, "j1", 0], [0, exit.id, 0]]);
  const receiving = graph => junctionMovements(graph, exit).find(move => move.from === drop.id && move.to === "east");
  assert.equal(receiving(branch.network).toLane, 0);
  const index = branch.network.roads.indexOf(slip);
  const moved = moveRoadLaneAnchor(branch.network, index, "b", { id: exit.id, anchor: { neighbor: "east", lane: 1 } });
  assert.ok(moved.network, moved.issue);
  assert.equal(receiving(moved.network).toLane, 1);
  const road = moved.network.roads[index];
  const path = networkLaneSamples(road, moved.network, networkNodes(moved.network), true, 0);
  assert.ok(Math.abs(path.at(-1).y - 183) < 1e-6);
  assert.equal(isLaneDrop(removeNetworkRoad(branch.network, index), drop), true);
});

test("a curve pull follows the finger across the chord with fixed endpoints", () => {
  const a = { id: "j1", x: 200, y: 300 }, b = { id: "j2", x: 300, y: 300 };
  assert.equal(roadCurveFromPull(a, b, { x: 25, y: 0 }), undefined);
  const controls = roadCurveFromPull(a, b, { x: 25, y: -30 });
  const curve = networkRoadGeometry({ a: a.id, b: b.id, bend: 0, controls }, new Map([[a.id, a], [b.id, b]]));
  assert.deepEqual(curve.start, a);
  assert.deepEqual(curve.end, b);
  assert.equal(curve.samples[50].y, 270);
});

test("splitting a road keeps movement rules attached to the original intersection", () => {
  const network = starterNetwork();
  const junction = network.nodes[0];
  junction.movements = junctionMovements(network, junction).filter(move => move.from === "west" && move.to === "east")
    .map(move => ({ ...move, rule: "stop" }));
  const split = nextNetworkNode(network, { x: 155, y: 180 });
  const { network: edited, issue } = splitNetworkRoad(network, 1, split, .5);
  assert.ok(edited, issue);
  assert.deepEqual(edited.nodes[0].movements, [{ from: split.id, to: "east", fromLane: 0, toLane: 0, rule: "stop" }]);
  assert.ok(validate({ ...baseline, network: edited }));
});

test("crossing roads share a junction and preserve curves, lanes, and endpoint rules", () => {
  const avenue = { a: "north", b: "south", forward: 1, backward: 2, bend: 12, atA: "stop", atB: "priority" };
  const crossStreet = { a: "west", b: "east", forward: 1, backward: 0, bend: 0 };
  const before = { nodes: [], roads: [avenue] };
  const { network, issue } = connectNetworkRoad(before, crossStreet);
  assert.ok(network, issue);
  assert.equal(network.nodes.length, 1);
  const [junction] = network.nodes;
  assert.equal(junction.y, 180);
  assert.equal(junction.control, "priority");
  assert.ok(network.roads.every(road => road.a === junction.id || road.b === junction.id));
  const [upper, lower, west, east] = network.roads;
  assert.deepEqual([upper.atA, upper.atB, lower.atA, lower.atB], ["stop", undefined, undefined, "priority"]);
  assert.deepEqual(network.roads.map(({ forward, backward }) => [forward, backward]), [[1, 2], [1, 2], [1, 0], [1, 0]]);
  const nodes = networkNodes(network);
  const original = networkRoadGeometry(avenue, nodes);
  const first = networkRoadGeometry(upper, nodes), second = networkRoadGeometry(lower, nodes);
  assert.ok(Math.abs(first.length + second.length - original.length) < .01);
  assert.ok(Math.abs(first.samples.at(-1).angle - second.samples[0].angle) < .001);
  assert.ok(validate({ ...baseline, network }));
  assert.match(connectNetworkRoad(network, crossStreet).issue, /overlap/);
  assert.equal(before.roads.length, 1);
});

test("moving a junction translates its adjacent curve handle and keeps invalid moves atomic", () => {
  const network = starterNetwork();
  const result = moveNetworkNode(network, "j2", { x: 270, y: 340 });
  assert.ok(result.network, result.issue);
  const pickup = result.network.roads.find(road => road.a === "pickup");
  assert.deepEqual(pickup.controls, [368, 440, 270, 433]);
  assert.equal(pickup.atB, "yield");
  assert.ok(validate({ ...baseline, network: result.network }));
  assert.match(moveNetworkNode(network, "j2", { x: 110, y: 210 }).issue, /school/);
  assert.equal(network.nodes.find(node => node.id === "j2").y, 327);
  assert.match(moveNetworkNode(network, "north", { x: 270, y: 110 }).issue, /fixed/);
});

test("moving the merge and reshaping its bend preserve tangent alignment", () => {
  const design = { ...baseline, node: 351, entry: 53, exit: 89 };
  for (const lane of [1, 2]) {
    const path = curve(design, lane);
    assert.equal(path.a.y, path.start.y);
    assert.equal(path.b.x, path.end.x);
    assert.equal(path.end.y, design.node);
    assert.deepEqual(pointOnCurve(path, path.length), {
      x: path.end.x, y: path.end.y, angle: -Math.PI / 2
    });
  }
});

test("curve edits affect the speed exported to SUMO", () => {
  const tight = { ...baseline, entry: 30 };
  assert.ok(curve(tight).radius < curve(baseline).radius);
  assert.ok(curve(tight).speed < curve(baseline).speed);
});

test("taper length changes curvature without moving the lane end", () => {
  const short = mergeTaper({ ...baseline, taperLength: 24 });
  const long = mergeTaper({ ...baseline, taperLength: 65 });
  assert.equal(short.end, long.end);
  assert.equal(long.start - short.start, 41);
  assert.ok(long.radius > short.radius);
  assert.ok(long.speed > short.speed);
  assert.equal(validate({ ...baseline, mergeEnd: 250, taperLength: 70 }), false);
});

test("road saves migrate and invalid edits cannot reach SUMO", () => {
  const { mergeEnd, taperLength, green, ...legacy } = { ...baseline, node: 275, lanes: 2 };
  assert.ok(validate(legacy));
  const migrated = normalizeDesign(legacy);
  assert.equal(migrated.mergeEnd, 221);
  assert.equal(migrated.taperLength, taperLength);
  assert.equal(migrated.green, green);
  const { taperYield, ...oldPrioritySave } = { ...baseline, pickupYield: true };
  assert.equal(taperYield, false);
  assert.equal(normalizeDesign(oldPrioritySave).taperYield, true);
  assert.ok(validate(migrated));
  assert.equal(validate({ ...baseline, lanes: 0 }), false);
  assert.equal(validate({ ...baseline, mergeEnd: 270 }), false);
  assert.equal(validate({ ...baseline, green: 28 }), false);
});
