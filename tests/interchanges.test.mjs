import test from "node:test";
import assert from "node:assert/strict";
import { maps, previewRamp, validate, baseline } from "../model.mjs";
import { sumoInputs } from "../sumo-network.mjs";
import { sumoRequest } from "../sumo-export.mjs";

// These locations use game units and the shipped editor limits. No new menu entry.
const map = "interchange-fixture";
const positions = { west: [38, 340], east: [462, 340], north: [250, 128], south: [250, 552] };
const directions = [
  ["west", "east", true], ["north", "south", true],
  ["west", "east", false], ["north", "south", false]
];
function site() {
  maps[map] = { buildings: [], trees: [], terminals: Object.fromEntries(
    Object.entries(positions).map(([id, [x, y]]) => [id, { id, x, y, dx: Math.sign(x - 250) * 20, dy: Math.sign(y - 340) * 20 }])) };
  const road = (a, b, grade) => ({ a, b, grade, forward: 2, backward: 2, bend: 0 });
  return { map, nodes: [], roads: [road("west", "east", 0), road("north", "south", 1)] };
}
function lane(direction, station) {
  const [a, b, forward] = directions[direction % 4];
  return { host: { a, b }, forward, lane: 0, t: forward ? station : 1 - station };
}
function apply(network, start, end, shape, reach) {
  const candidate = previewRamp(network, { start, end, shape, reach });
  assert.ok(candidate.network, candidate.issue);
  return candidate.network;
}
function routeXml(network, from, to) {
  const design = { ...baseline, network };
  assert.ok(validate(design));
  const request = sumoRequest(design, "short-merge");
  request.trips = [{ id: 0, kind: "car", from, to, time: 1, origin: "cross" }];
  return sumoInputs(request, request.edited)["routes.xml"];
}
const origin = direction => directions[direction % 4][directions[direction % 4][2] ? 0 : 1];
const destination = direction => origin(direction + 2);

test("four loops and four outer slips restore every directional turning movement", () => {
  let network = site();
  for (let i = 0; i < 4; i++) {
    assert.doesNotMatch(routeXml(network, origin(i), destination(i + 3)), /<vehicle /);
    network = apply(network, lane(i, .66), lane(i + 3, .34), "loop");
    assert.match(routeXml(network, origin(i), destination(i + 3)), /<vehicle /);
  }
  for (let i = 0; i < 4; i++) {
    network = apply(network, lane(i, .09), lane(i + 1, .91), "direct", 18);
  }
  assert.equal(Object.keys(network.ramps).length, 8);
  for (let i = 0; i < 4; i++) for (const turn of [0, 1, 3]) {
    assert.match(routeXml(network, origin(i), destination(i + turn)), /<vehicle /);
  }
  const blocked = site();
  maps[map].buildings = [{ name: "Depot", x: 252, y: 352, w: 128, h: 108 }];
  assert.match(previewRamp(blocked, { start: lane(0, .66), end: lane(3, .34), shape: "loop" }).issue, /Depot/);
});

test("four diamond ramps share two surface terminals and leave the deck isolated", () => {
  let network = site();
  for (const [from, start, to, end] of [[1,.16,2,.67],[0,.33,1,.76],[3,.16,0,.67],[2,.33,3,.76]]) {
    network = apply(network, lane(from, start), lane(to, end), "direct");
  }
  const terminals = network.nodes.filter(node => network.roads.filter(road => road.rampId && [road.a, road.b].includes(node.id)).length === 2);
  assert.equal(terminals.length, 2);
  assert.equal(network.nodes.some(node => node.x === 250 && node.y === 340), false);
  for (const [from, to] of [["north","west"],["west","south"],["south","east"],["east","north"],["north","south"],["west","east"]]) {
    assert.match(routeXml(network, from, to), /<vehicle /);
  }
});

test("the loop can serve either left movement at a three-leg trumpet", () => {
  for (const loopFrom of [2,3]) {
    let network = site();
    network.nodes = [{ id: "j80", x: 250, y: 128, control: "priority" }];
    network.roads[1].a = "j80";
    const port = (i, station) => {
      const target = lane(i, station);
      if (target.host.a === "north") target.host.a = "j80";
      return target;
    };
    // The terminating south leg has two left movements. Each design puts
    // one on the loop and gives the other a tangent-matched direct connector.
    const turns = [
      [0, 1, .09, .91, "direct", 18],
      [3, 0, .09, .91, "direct", 18],
      ...(loopFrom === 2 ? [
        [2, 1, .66, .34, "loop"],
        [3, 2, .22, .78, "direct", 110]
      ] : [
        [2, 1, .22, .45, "direct", 18],
        [3, 2, .66, .34, "loop"]
      ])
    ];
    for (const [from, to, start, end, shape, reach] of turns) {
      network = apply(network, port(from, start), port(to, end), shape, reach);
    }
    const roadIndex = network.roads.findIndex(r => network.ramps[r.rampId]?.shape === "loop");
    const from = loopFrom === 2 ? "east" : "south", to = loopFrom === 2 ? "south" : "west";
    assert.match(routeXml(network, from, to), new RegExp("road-" + roadIndex + "-f"));
    for (const [a,b] of [["west","south"],["south","east"],["east","west"],["west","east"]]) {
      assert.match(routeXml(network, a, b), /<vehicle /);
    }
  }
});

test("in-road departures preserve the through lane on T and shallow Y branches", () => {
  for (const shallow of [false, true]) {
    let network = site();
    if (shallow) {
      Object.assign(maps[map].terminals.south, { x: 462, y: 450, dx: 20, dy: 7 });
    }
    network = { ...network, nodes: [{ id: "j10", x: 250, y: 405, control: "priority" }],
      roads: [network.roads[0], { a: "j10", b: "south", forward: 1, backward: 0, bend: 0 }] };
    const source = lane(0, .36);
    const receiving = { host: { a: "j10", b: "south" }, forward: true, t: .35, lane: 0 };
    const result = apply(network, source, receiving, "direct");
    const cut = result.roads.find(road => road.rampId && road.laneA);
    const host = result.roads.filter(road => road.rampHost?.source.a === "west");
    assert.equal(host.length, 2);
    assert.ok(host.every(road => road.forward === 2 && road.backward === 2));
    assert.ok(host.every(road => [road.a, road.b].includes(cut.a)));
    assert.match(routeXml(result, "west", "east"), /<vehicle /);
    assert.match(routeXml(result, "west", "south"), new RegExp("road-" + result.roads.indexOf(cut) + "-f"));
  }
});
