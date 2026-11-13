import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { avenueSegments, baseline, duration, junctionMovements, starterNetwork, step, world } from "../model.mjs";
import { configureJunctions, netconvertArgs, sumoArgs, sumoInputs } from "../sumo-network.mjs";
import { readSumoComparison, sumoRequest } from "../sumo-export.mjs";

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
