import test from "node:test";
import assert from "node:assert/strict";
import { baseline, connectNetworkRoad, curve, mergeTaper, moveNetworkNode, networkNodes, networkRoadGeometry, normalizeDesign, pointOnCurve, starterNetwork, validate } from "../model.mjs";

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
