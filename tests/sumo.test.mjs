import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { avenueSegments, baseline, buildNetworkRoundabout, connectNetworkRoad, duration, junctionCrossingAxes, junctionMovements, levels, levelTrips, levelStart, maps, networkNodes, networkRoadGeometry, previewRamp, rampLaneTargets, separateNetworkJunction, shiftNetworkRoad, splitNetworkRoad, starterNetwork, step, validate, world } from "../model.mjs";
import { configureJunctions, crossingDemandPreview, netconvertArgs, networkDemandPreview, networkWeaves, rampDemandPreview, signalOutputRequest, sumoArgs, sumoInputs, sumoResult } from "../sumo-network.mjs";
import { readSumoComparison, sumoRequest } from "../sumo-export.mjs";
import { harborCrossing } from "./fixtures/harbor-crossing.mjs";

test("each level starts below an achievable goal with the same demand", async () => {
  const fixes = [
    ({ nodes, roads }) => { nodes[1].control = "traffic_light"; roads[0].backward = roads[3].backward = 2; },
    network => buildNetworkRoundabout(network, "j1", 34),
    ({ roads }) => { roads[2].forward = 3; roads[3].forward = 2; },
    ({ nodes }) => { delete nodes[1].laneRules; },
    network => separateNetworkJunction(network, "j1", "j3", -1)
  ];
  const dir = await mkdtemp(join(tmpdir(), "traffic-level-goals-"));
  const command = (program, args) => {
    const result = spawnSync(program, args, { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  };
  const run = async (request, layout) => {
    const files = sumoInputs(request, layout);
    for (const [name, contents] of Object.entries(files)) await writeFile(join(dir, name), contents);
    command("netconvert", netconvertArgs);
    const net = configureJunctions(await readFile(join(dir, "corridor.net.xml"), "utf8"), layout.design, request.signalCycle);
    await writeFile(join(dir, "corridor.net.xml"), net);
    const signal = signalOutputRequest(net);
    if (signal) await writeFile(join(dir, "signals.add.xml"), signal);
    command("sumo", sumoArgs(request, !!signal));
    const [trace, trips, collisions] = await Promise.all(["trace.xml", "trips.xml", "collisions.xml"].map(name => readFile(join(dir, name), "utf8")));
    const deck = layout.design.network.roads.find(road => road.grade);
    if (deck) {
      assert.equal(layout.design.network.nodes.some(node => node.id === "j1"), false);
      assert.doesNotMatch(net, /<junction id="j1"/);
      assert.ok(trace.includes(`z="${(5.5 * deck.grade).toFixed(4)}"`));
    }
    if (layout.design.network.roads.some(road => road.roundabout)) {
      assert.match(net, /<roundabout nodes="[^"]+" edges="[^"]+"/);
      const ringIndices = layout.design.network.roads.flatMap((road, index) => road.roundabout ? [index] : []);
      const entries = new RegExp(`<connection from="road-[0-3]-[fb]" to="road-(?:${ringIndices.join("|")})-f"[^>]+state="m"`, "g");
      assert.equal([...net.matchAll(entries)].length, 4);
    }
    const run = sumoResult(request, layout, trace, trips, collisions, net);
    if (deck) assert.ok(run.frames.some(frame => frame.markers.some(marker => marker.grade === deck.grade)));
    return run.results;
  };
  try {
    for (const [index, level] of levels.entries()) {
      const design = levelStart(level.id);
      const result = fixes[index](design.network);
      assert.ok(!result?.issue, result?.issue);
      if (result?.network) design.network = result.network;
      const request = sumoRequest(design, level.id);
      const before = await run(request, request.original);
      const after = await run(request, request.edited);
      assert.equal(before.unserved, 0, level.id);
      assert.equal(before.collisions, 0, level.id);
      assert.equal(after.unserved, 0, level.id);
      assert.equal(after.collisions, 0, level.id);
      assert.ok(after.finished >= before.finished, level.id);
      const delta = after[level.metric] - before[level.metric];
      assert.ok(level.metric === "busDelay" ? delta < -1 : delta > 0, level.id);
      if (index === 4) {
        const bridge = separateNetworkJunction(levelStart(level.id).network, "j1", "j2", 1);
        assert.ok(bridge.network, bridge.issue);
        const comparison = sumoRequest({ ...design, network: bridge.network }, level.id);
        const over = await run(comparison, comparison.edited);
        assert.equal(over.finished, after.finished);
        assert.equal(over.collisions, 0);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("SUMO receives shifted lane shapes and obeys lane-wide and intersection-wide rules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "traffic-junction-rules-"));
  try {
    const starter = starterNetwork();
    const shifted = shiftNetworkRoad(starter, 3, 1);
    assert.ok(shifted.network, shifted.issue);
    const { nodes, roads } = shifted.network;
    for (const rules of [{ control: "yield" }, { control: "priority", laneRules: { "west:0": "stop", "north:0": "yield" } }]) {
      const network = { nodes: [{ ...nodes[0], ...rules }, nodes[1]], roads };
      const design = { ...baseline, network };
      const request = sumoRequest(design);
      const files = sumoInputs(request, request.edited);
      assert.match(files["edges.xml"], /<edge id="road-3-f"[^>]*>\s*<lane index="0" shape="208\.8000,/);
      for (const [name, contents] of Object.entries(files)) await writeFile(join(dir, name), contents);
      const built = spawnSync("netconvert", netconvertArgs, { cwd: dir, encoding: "utf8" });
      assert.equal(built.status, 0, built.error?.message ?? built.stderr);
      const net = configureJunctions(await readFile(join(dir, "corridor.net.xml"), "utf8"), design, request.cycle);
      const connections = [...net.matchAll(/<connection from="(road-\d+-[fb])"[^>]+via=":j1[^"]+"[^>]+state="([^"]+)"/g)];
      assert.equal(connections.length, 12);
      for (const [, edge, state] of connections) {
        if (rules.control === "yield" || edge === "road-0-f") assert.equal(state, "m");
        if (rules.control === "priority" && edge === "road-1-f") assert.equal(state, "s");
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("native SUMO follows an extra lane into its taper or the selected slip-lane branch", async () => {
  const junction = (id, x, y) => ({ id, x, y, control: "priority" });
  let { network } = splitNetworkRoad(starterNetwork(), 3, junction("j3", 270, 250), 70 / 147);
  ({ network } = splitNetworkRoad(network, 2, junction("j4", 338, 180), 68 / 200));
  network.roads[5] = { ...network.roads[5], backward: 2 };
  network.roads[3] = { ...network.roads[3], forward: 2 };
  const slip = { a: "j3", b: "j4", forward: 1, backward: 0, bend: 0, controls: [270, 215, 306, 180],
    laneA: { neighbor: "j2", lane: 0 }, laneB: { neighbor: "east", lane: 0 } };
  const branch = connectNetworkRoad(network, slip);
  assert.ok(branch.network, branch.issue);
  const dir = await mkdtemp(join(tmpdir(), "traffic-lane-branch-"));
  const run = (command, args) => {
    const result = spawnSync(command, args, { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  };
  try {
    for (const [graph, hasSlip] of [[network, false], [branch.network, true]]) {
      const request = sumoRequest({ ...baseline, network: graph });
      const files = sumoInputs(request, request.edited);
      for (const [name, contents] of Object.entries(files)) await writeFile(join(dir, name), contents);
      run("netconvert", netconvertArgs);
      const file = join(dir, "corridor.net.xml");
      const xml = await readFile(file, "utf8");
      if (hasSlip) {
        assert.match(xml, /<connection from="road-5-b" to="road-9-f" fromLane="0" toLane="0"/);
        assert.doesNotMatch(xml, /<connection from="road-5-b" to="road-4-b" fromLane="0"/);
        assert.match(xml, /<connection from="road-9-f" to="road-3-f" fromLane="0" toLane="0"/);
        assert.match(files["routes.xml"], /id="south-to-east"[^>]*road-9-f/);
      } else {
        assert.match(xml, /<junction id="j3" type="zipper"/);
        assert.match(xml, /<connection from="road-5-b" to="road-4-b" fromLane="0" toLane="0"/);
      }
      await writeFile(file, configureJunctions(xml, request.edited.design, request.signalCycle));
      run("sumo", sumoArgs(request));
      assert.doesNotMatch(await readFile(join(dir, "collisions.xml"), "utf8"), /<collision /);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("SUMO enforces movement permissions and distinct rules on the same incoming lane", async () => {
  const network = starterNetwork();
  const junction = network.nodes[0];
  junction.movements = junctionMovements(network, junction).filter(move => move.from !== "east" && !(move.from === "west" && move.to === "east"));
  const signalRequest = sumoRequest({ ...baseline, network });
  const signalFiles = sumoInputs(signalRequest, signalRequest.edited);
  assert.doesNotMatch(signalFiles["routes.xml"], /west-to-east/);
  const dir = await mkdtemp(join(tmpdir(), "traffic-movements-"));
  const run = (command, args) => {
    const result = spawnSync(command, args, { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  };
  const convert = async files => {
    for (const [name, contents] of Object.entries(files)) await writeFile(join(dir, name), contents);
    run("netconvert", netconvertArgs);
    return readFile(join(dir, "corridor.net.xml"), "utf8");
  };
  try {
    const signal = await convert(signalFiles);
    assert.match(signal, /<tlLogic id="j1"/);
    assert.doesNotMatch(signal, /<connection from="road-1-f" to="road-2-f"/);
    assert.doesNotMatch(signal, /<connection from="road-2-b"/);
    junction.control = "priority";
    junction.movements.push({ from: "west", fromLane: 0, to: "east", toLane: 0, rule: "stop" });
    junction.movements.find(move => move.from === "west" && move.to === "north").rule = "yield";
    const request = sumoRequest({ ...baseline, network });
    const files = sumoInputs(request, request.edited);
    assert.match(files["routes.xml"], /west-to-east/);
    const adjusted = configureJunctions(await convert(files), request.edited.design, request.signalCycle);
    assert.match(adjusted, /<connection from="road-1-f" to="road-2-f" fromLane="0"[^>]+state="s"/);
    assert.match(adjusted, /<connection from="road-1-f" to="road-0-b" fromLane="0"[^>]+state="m"/);
    await writeFile(join(dir, "corridor.net.xml"), adjusted);
    run("sumo", sumoArgs(request));
    assert.doesNotMatch(await readFile(join(dir, "collisions.xml"), "utf8"), /<collision /);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("SUMO uses the same demand and exports the edited taper and lane choices", () => {
  const design = { ...baseline, lanes: 2, mergeEnd: 241, taperLength: 50, green: 26 };
  const request = sumoRequest(design);
  assert.equal(request.trips.length, 116);
  assert.equal(request.edited.design.lanes, 2);
  assert.deepEqual(request.edited.taper.at(-1), [world.outer, 241]);
  assert.deepEqual(request.original.taper.at(-1), [world.outer, baseline.mergeEnd]);
  assert.throws(() => sumoRequest({ ...design, lanes: 0 }), /Invalid/);
  assert.throws(() => readSumoComparison(null, design), /invalid comparison/);
});

test("pickup junction and taper have independent priority in the SUMO network", () => {
  const request = sumoRequest({ ...baseline, lanes: 3, taperYield: true });
  const files = sumoInputs(request, request.edited);
  assert.match(files["nodes.xml"], /id="join"[^>]*type="zipper"/);
  assert.match(files["nodes.xml"], /id="taper"[^>]*type="priority"/);
  assert.match(files["connections.xml"], /prohibitor="approach->downstream" prohibited="merge-lane->downstream"/);
  assert.doesNotMatch(files["connections.xml"], /prohibited="pickup-road->approach"/);
});

test("native Eclipse SUMO runs the edited road and produces deterministic importable data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "traffic-sumo-test-"));
  const input = join(dir, "request.json");
  const output = join(dir, "results.json");
  const design = { ...baseline, lanes: 2, mergeEnd: 241, taperLength: 50, green: 26 };
  try {
    await writeFile(input, JSON.stringify(sumoRequest(design)));
    const run = async () => {
      const native = spawnSync(process.execPath, ["scripts/run-sumo.mjs", input, output], { encoding: "utf8" });
      assert.equal(native.status, 0, native.error?.message ?? native.stderr);
      return JSON.parse(await readFile(output, "utf8"));
    };
    const data = await run();
    assert.deepEqual(await run(), data);
    assert.match(data.version, /Eclipse SUMO.*1\.28\.0/);
    assert.equal(readSumoComparison(data, design), data);
    assert.throws(() => readSumoComparison(data, baseline), /different road design/);
    for (const run of [data.original, data.edited]) {
      assert.equal(run.frames.length, duration / step + 1);
      assert.equal(run.results.collisions, 0);
      assert.equal(run.results.finished + run.results.waiting, 116);
      assert.ok(run.results.finished > 0);
    }
    assert.ok(data.edited.frames.some(frame => frame.markers.some(car =>
      car.kind === "pickup" && car.y < baseline.node && car.x > world.outer + 5)));
    assert.ok(data.edited.results.busDelay < data.original.results.busDelay);
    assert.ok(data.edited.results.crossDelay > data.original.results.crossDelay);
    assert.ok(data.edited.results.crossFinished < data.original.results.crossFinished);
    assert.equal(data.edited.frames[28 / step].phase, "avenue-yellow");
    assert.equal(data.edited.frames[32 / step].phase, "cross");
    assert.ok(data.edited.frames.some(frame => frame.markers.some(car => car.zone === "Cross street" && car.reason)));
    for (const run of [data.original, data.edited]) {
      assert.equal(run.frames[run.results.peakFrame].longestQueue, run.results.longestQueue);
      assert.ok(run.frames[run.results.peakFrame].queueZone);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the drawn slip lane serves eastbound traffic when the signal turn is banned", async () => {
  const dir = await mkdtemp(join(tmpdir(), "traffic-junction-test-"));
  const input = join(dir, "request.json");
  const output = join(dir, "results.json");
  const design = { ...baseline, lanes: 2, mergeEnd: 245, slipStart: 220, slipEnd: 380,
    signalRight: false, schoolRight: false, pickupYield: true };
  try {
    await writeFile(input, JSON.stringify(sumoRequest(design)));
    const native = spawnSync(process.execPath, ["scripts/run-sumo.mjs", input, output], { encoding: "utf8" });
    assert.equal(native.status, 0, native.stderr);
    const data = readSumoComparison(JSON.parse(await readFile(output, "utf8")), design);
    assert.ok(data.edited.results.slipFinished > 0);
    assert.equal(data.edited.results.unserved, 4);
    assert.equal(data.edited.results.collisions, 0);
    assert.ok(data.edited.frames.some(frame => frame.markers.some(car => car.zone === "Slip lane")));
    assert.equal(data.original.results.slipFinished, 0);
    assert.equal(data.original.results.unserved, 0);
    assert.throws(() => sumoRequest({ ...design, slipStart: 245 }), /Invalid/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rebuilt segments export asymmetric lanes and connect both slips to lane three", () => {
  const geometry = { ...baseline, slipStart: 220, slipEnd: 378 };
  const road = avenueSegments(geometry).map(segment => segment.top === 220
    ? { ...segment, north: 4, south: 1, bend: 8 } : segment);
  const request = sumoRequest({ ...geometry, road, slipLane: 3, pickupLane: 3 });
  const files = sumoInputs(request, request.edited);
  assert.match(files["edges.xml"], /id="road-n-220-310"[^>]*numLanes="4"/);
  assert.match(files["edges.xml"], /id="road-s-220-310"[^>]*numLanes="1"/);
  assert.match(files["connections.xml"], /from="pickup-road" to="road-n-220-310" fromLane="0" toLane="1"/);
  assert.match(files["connections.xml"], /from="road-n-220-310" to="slip-road" fromLane="1" toLane="0"/);
  assert.ok(request.trips.some(trip => trip.origin === "southbound"));
  const cleared = sumoInputs(request, { ...request.edited, design: { ...request.edited.design, road: [] } });
  assert.doesNotMatch(cleared["routes.xml"], /route="(?:southbound|outer|direct)/);
  assert.match(cleared["routes.xml"], /route="cross"/);
});

test("rebuilding a cleared avenue does not recreate removed access roads", () => {
  const design = { ...baseline, lanes: 0, schoolAccess: false,
    road: [{ top: world.north, bottom: world.south, north: 1, south: 1, bend: 0 }] };
  const request = sumoRequest(design);
  const files = sumoInputs(request, request.edited);
  assert.doesNotMatch(files["nodes.xml"], /id="(?:join|school-fork|slip-fork)"/);
  assert.doesNotMatch(files["edges.xml"], /id="(?:pickup-road|school-in|slip-road)"/);
  assert.match(files["routes.xml"], /id="outer"/);
});

test("clean slate keeps demand and only routes trips through connected, correctly directed roads", () => {
  const network = { nodes: [], roads: [] };
  const blank = sumoRequest({ ...baseline, network });
  const blankFiles = sumoInputs(blank, blank.edited);
  assert.equal(blank.trips.length, 128);
  assert.equal([...blankFiles["edges.xml"].matchAll(/<edge /g)].length, 12);
  assert.doesNotMatch(blankFiles["routes.xml"], /<vehicle /);

  const nodes = [
    { id: "j1", x: 270, y: 180, control: "traffic_light" },
    { id: "j2", x: 270, y: 327, control: "priority" }
  ];
  const roads = [
    ["north", "j1"], ["west", "j1"], ["east", "j1"], ["j1", "j2"],
    ["j2", "south"], ["school", "j2"], ["pickup", "j2"]
  ].map(([a, b]) => ({ a, b, forward: 1, backward: 1, bend: 0 }));
  const request = sumoRequest({ ...baseline, network: { nodes, roads } });
  const files = sumoInputs(request, request.edited);
  assert.match(files["routes.xml"], /id="south-to-school" edges="south-in [^"]+ school-out"/);
  assert.equal([...files["routes.xml"].matchAll(/<vehicle /g)].length, 128);
  assert.match(files["nodes.xml"], /id="j1"[^>]+type="traffic_light"/);
  assert.match(files["nodes.xml"], /id="j2"[^>]+type="right_before_left"/);

  nodes[0] = { ...nodes[0], control: "priority" };
  roads[0] = { ...roads[0], atB: "priority" };
  roads[1] = { ...roads[1], atB: "stop" };
  roads[2] = { ...roads[2], atB: "yield" };
  const controlled = sumoRequest({ ...baseline, network: { nodes, roads } });
  const controlledFiles = sumoInputs(controlled, controlled.edited);
  assert.match(controlledFiles["nodes.xml"], /id="j1"[^>]+type="priority" rightOfWay="edgePriority"/);
  assert.match(controlledFiles["edges.xml"], /id="road-0-f"[^>]+priority="3"/);
  assert.match(controlledFiles["edges.xml"], /id="road-1-f"[^>]+priority="1"/);
  assert.match(controlledFiles["edges.xml"], /id="road-2-f"[^>]+priority="1"/);
  const links = '<connection from="road-1-f" to="road-2-b" state="m"/><connection from="road-2-f" to="road-1-b" state="m"/>';
  const controlledLinks = configureJunctions(links, controlled.edited.design, controlled.signalCycle);
  assert.match(controlledLinks, /from="road-1-f"[^>]+state="s"/);
  assert.match(controlledLinks, /from="road-2-f"[^>]+state="m"/);

  nodes[0] = { ...nodes[0], control: "allway_stop" };
  const allWay = sumoRequest({ ...baseline, network: { nodes, roads } });
  const allWayFiles = sumoInputs(allWay, allWay.edited);
  assert.match(allWayFiles["nodes.xml"], /id="j1"[^>]+type="allway_stop"/);
  assert.equal(configureJunctions(links, allWay.edited.design, allWay.signalCycle), links);
  roads[5] = { ...roads[5], backward: 0 };
  const oneWay = sumoRequest({ ...baseline, network: { nodes, roads } });
  assert.doesNotMatch(sumoInputs(oneWay, oneWay.edited)["routes.xml"], /south-to-school/);
});

test("a stop sign halts a vehicle at the junction and allows it to continue", async () => {
  const dir = await mkdtemp(join(tmpdir(), "traffic-sumo-stop-"));
  const nodes = [{ id: "j1", x: 270, y: 180, control: "priority" }];
  const roads = [
    { a: "north", b: "j1", forward: 1, backward: 1, bend: 0, atB: "priority" },
    { a: "west", b: "j1", forward: 1, backward: 1, bend: 0, atB: "stop" },
    { a: "j1", b: "east", forward: 1, backward: 1, bend: 0 }
  ];
  const request = sumoRequest({ ...baseline, network: { nodes, roads } });
  request.trips = [request.trips.find(trip => trip.origin === "cross")];
  const run = (command, args) => {
    const result = spawnSync(command, args, { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  };
  try {
    for (const [name, contents] of Object.entries(sumoInputs(request, request.edited))) await writeFile(join(dir, name), contents);
    run("netconvert", netconvertArgs);
    const file = join(dir, "corridor.net.xml");
    await writeFile(file, configureJunctions(await readFile(file, "utf8"), request.edited.design, request.signalCycle));
    run("sumo", sumoArgs(request));
    const trace = await readFile(join(dir, "trace.xml"), "utf8");
    const approach = trace.match(/<vehicle [^>]+lane="road-1-f_0"[^>]*>/g);
    assert.ok(approach.slice(-5).some(tag => Number(tag.match(/speed="([^"]+)"/)[1]) < .05));
    assert.match(await readFile(join(dir, "trips.xml"), "utf8"), /<tripinfo [^>]+arrival="\d+\.\d+"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Harbor's fixed demand follows the chosen SUMO lanes before and after adding ramps", async () => {
  const design = JSON.parse(JSON.stringify(harborCrossing()));
  assert.ok(validate(design));
  const { network: original } = design;
  const trips = levelTrips("short-merge");
  const axes = junctionCrossingAxes(original, "j1").map(pair => pair.map(leg => leg.neighbor));
  const affected = crossingDemandPreview(original, trips, "j1", axes);
  assert.deepEqual(affected.movements.map(({ from, to, affected }) => [from, to, affected]),
    [["west", "north", 62], ["south", "east", 11]]);
  assert.equal(affected.affected, 73);
  const separated = separateNetworkJunction(original, "j1", "north", 1);
  assert.ok(separated.network, separated.issue);
  assert.deepEqual(networkDemandPreview(separated.network, trips, original).movements
    .map(({ from, to, scheduled, lost }) => [from, to, scheduled, lost]),
  [["west", "north", 0, 62], ["west", "east", 21, 0], ["south", "north", 36, 0], ["south", "east", 0, 11]]);
  const draw = (network, from, to, shape) => {
    const target = ([x, y], end) => rampLaneTargets(network, { x, y }, end)[0];
    const result = previewRamp(network, { start: target(from, "a"), end: target(to, "b"), shape });
    assert.ok(result.network, result.issue);
    return result;
  };
  const loop = draw(separated.network, [327.4655, 347.9792], [252.9928, 373.2367], "loop");
  const direct = draw(loop.network, [265.8623, 348.9682], [378.2909, 368.9748], "direct");
  assert.equal(networkDemandPreview(loop.network, trips, original).lost, 11);
  assert.equal(networkDemandPreview(direct.network, trips, original).lost, 0);
  const projected = rampDemandPreview(direct.network, trips, loop.rampId);
  assert.equal(projected.scheduled, 62);
  assert.equal(projected.weaves.length, 1);
  assert.equal(projected.weaves[0].toRamp, direct.rampId);
  assert.ok(projected.weaves[0].distance > 20 && projected.weaves[0].distance < 24);
  assert.ok(projected.weaves[0].samples.length > 1);
  const saved = JSON.parse(JSON.stringify({ ...design, network: direct.network }));
  assert.ok(validate(saved));
  assert.deepEqual(sumoRequest(saved, "short-merge").trips, trips);

  const dir = await mkdtemp(join(tmpdir(), "traffic-harbor-ramps-"));
  const command = (program, args) => {
    const result = spawnSync(program, args, { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  };
  const run = async network => {
    const request = sumoRequest({ ...design, network }, "short-merge");
    const files = sumoInputs(request, request.edited);
    for (const [name, contents] of Object.entries(files)) await writeFile(join(dir, name), contents);
    command("netconvert", netconvertArgs);
    const file = join(dir, "corridor.net.xml");
    const net = configureJunctions(await readFile(file, "utf8"), request.edited.design, request.signalCycle);
    await writeFile(file, net);
    command("sumo", sumoArgs(request));
    const [trace, output, collisions] = await Promise.all(["trace.xml", "trips.xml", "collisions.xml"].map(name => readFile(join(dir, name), "utf8")));
    const { results, frames } = sumoResult(request, request.edited, trace, output, collisions, net);
    assert.equal(results.collisions, [...collisions.matchAll(/<collision\s/g)].length);
    return { results, frames, net, routes: files["routes.xml"] };
  };
  try {
    const bare = await run(separated.network);
    assert.doesNotMatch(bare.net, /<junction id="j1"/);
    assert.doesNotMatch(bare.routes, /id="(?:west-to-north|south-to-east)"/);
    assert.equal(bare.results.finished, 57);
    assert.equal(bare.results.unserved, 73);
    assert.equal(bare.results.collisions, 0);
    assert.ok(bare.frames.some(frame => frame.markers.some(marker => marker.grade === 1)));

    const partial = await run(loop.network);
    assert.equal(partial.results.unserved, 11);
    assert.equal(partial.results.collisions, 0);
    assert.ok(partial.results.ramps[0].completed > 0);
    const roadIndices = loop.network.roads.flatMap((road, index) => road.rampId === loop.rampId ? [index] : []);
    const lanes = roadIndices.map(index => `road-${index}-f_0`);
    const trajectory = partial.frames.flatMap(frame => frame.markers.filter(marker => marker.id === 0 && marker.rampId === loop.rampId));
    assert.deepEqual([...new Set(trajectory.map(marker => marker.lane))], lanes);
    const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
    const sweep = trajectory.slice(1).reduce((total, marker, i) => total + angleDelta(trajectory[i].angle, marker.angle), 0);
    assert.ok(sweep > Math.PI, `native path turned ${sweep * 180 / Math.PI}°`);
    const nodes = networkNodes(loop.network);
    const samples = roadIndices.flatMap(index => networkRoadGeometry(loop.network.roads[index], nodes).samples);
    for (const marker of trajectory.slice(2, -2)) {
      assert.ok(samples.some(point => Math.hypot(marker.x - point.x, marker.y - point.y) < 2), JSON.stringify(marker));
    }
    const firstRampEdge = `road-${roadIndices[0]}-f`;
    const through = /id="west-to-east" edges="([^"]+)"/.exec(partial.routes)[1].split(" ");
    const approach = through[1];
    assert.match(partial.net, new RegExp(`<connection from="${approach}" to="${firstRampEdge}" fromLane="0" toLane="0"`));
    assert.doesNotMatch(partial.net, new RegExp(`<connection from="${approach}" to="${firstRampEdge}" fromLane="1"`));
    assert.match(partial.net, new RegExp(`<connection from="${approach}" to="${through[2]}" fromLane="0" toLane="0"`));
    assert.match(partial.net, new RegExp(`<connection from="${approach}" to="${through[2]}" fromLane="1" toLane="1"`));
    assert.ok(!through.includes(firstRampEdge));

    const restored = await run(saved.network);
    assert.equal(restored.results.unserved, 0);
    assert.equal(restored.results.collisions, 0);
    assert.deepEqual(restored.results.ramps.map(({ scheduled }) => scheduled), [62, 11]);
    assert.ok(restored.results.ramps.every(ramp => ramp.completed > 0));
    assert.equal(restored.results.weaves[0].id, projected.weaves[0].id);
    assert.equal(restored.results.weaves[0].short, true);
    assert.equal(restored.results.movements.reduce((sum, move) => sum + move.completed, 0), restored.results.finished);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("weaves follow the travel direction to the next exit over short and long distances", () => {
  const map = "weave-distance-fixture";
  const terminals = { west: [38, 280, -20], east: [462, 280, 20], north: [38, 430, -20], south: [462, 430, 20] };
  maps[map] = { buildings: [], trees: [],
    terminals: Object.fromEntries(Object.entries(terminals).map(([id, [x, y, dx]]) => [id, { id, x, y, dx, dy: 0 }])) };
  const main = { a: "west", b: "east" }, local = { a: "north", b: "south" };
  const network = { map, nodes: [], roads: [main, local].map(host => ({ ...host, forward: 2, backward: 2, bend: 0 })) };
  const lane = (host, t, lane) => ({ host, t, lane, forward: true });
  const connect = (network, start, end) => {
    const result = previewRamp(network, { start, end, shape: "direct" });
    assert.ok(result.network, result.issue);
    return result;
  };
  try {
    const merge = connect(network, lane(local, .07, 0), lane(main, .26, 0));
    const long = connect(merge.network, lane(main, .65, 1), lane(local, .89, 0));
    const check = (network, exit, distance, short) => {
      const weaves = networkWeaves(network).filter(weave => weave.fromRamp === merge.rampId);
      assert.equal(weaves.length, 1);
      const [weave] = weaves;
      assert.equal(weave.toRamp, exit.rampId);
      assert.ok(Math.abs(weave.distance - distance) < .001);
      assert.equal(weave.short, short);
      assert.equal(weave.fromLane, 0);
      assert.equal(weave.toLane, 1);
      assert.ok(weave.hostLanes.every(host => host.forward));
      assert.ok(weave.samples[0].x < weave.samples.at(-1).x);
    };
    check(long.network, long, 132.288, false);
    const near = connect(long.network, lane(main, .32, 1), lane(local, .54, 0));
    check(near.network, near, 20.352, true);
  } finally {
    delete maps[map];
  }
});
