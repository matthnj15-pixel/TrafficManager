import test from "node:test";
import assert from "node:assert/strict";
import { baseline, curve, duration, pointOnCurve, simulate, step, validate, world, scale, mergeTaper, vehicleDimensions, replayMarkers } from "../model.mjs";

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

test("a tighter curve lowers the speed readout and the same pickup car's simulated speed", () => {
  const tight = { ...baseline, entry: 30 };
  assert.ok(curve(tight).radius < curve(baseline).radius);
  assert.ok(curve(tight).speed < curve(baseline).speed);
  const firstPickup = run => run.frames[100].markers.find(car => car.kind === "pickup");
  assert.ok(firstPickup(simulate(tight)).speed < firstPickup(simulate(baseline)).speed);
});

test("replay is deterministic, counts all trips, and queues visibly at the original merge", () => {
  const run = simulate(baseline);
  assert.deepEqual(run, simulate(baseline));
  assert.equal(run.frames.length, duration / step + 1);
  assert.equal(run.results.finished + run.results.waiting, 88);
  assert.ok(run.frames.some(frame => frame.markers.some(car => car.reason === "Waiting for a merge gap")));
  assert.ok(run.frames.some(frame => frame.markers.some(car => car.reason === "Red signal")));
});

test("lane connections change vehicle paths and moving the join has a tradeoff", () => {
  const original = simulate(baseline);
  const alternate = simulate({ ...baseline, lanes: 2 });
  const shifted = simulate({ ...baseline, node: 375 });
  const usesAux = run => run.frames.some(frame => frame.markers.some(car => car.kind === "pickup" && car.lane === "auxiliary"));
  assert.equal(usesAux(original), false);
  assert.equal(usesAux(alternate), true);
  assert.notDeepEqual(alternate.results, original.results);
  assert.ok(shifted.results.longestQueue < original.results.longestQueue);
  assert.ok(shifted.results.busDelay > original.results.busDelay);

  const both = simulate({ ...baseline, lanes: 3, node: 375, mergeEnd: 315 });
  const approachById = new Map(both.frames.flatMap(frame => frame.markers
    .filter(car => car.lane === "r1" || car.lane === "r2").map(car => [car.id, car.lane])));
  const completedApproaches = new Set(both.frames.flatMap(frame => frame.markers
    .filter(car => car.lane === "outer" && car.kind === "pickup" && car.y < 315)
    .map(car => approachById.get(car.id))));
  assert.deepEqual(completedApproaches, new Set(["r1", "r2"]));

  const improved = simulate({ ...baseline, node: 375, entry: 25, exit: 20 }).results;
  assert.ok(improved.longestQueue < original.results.longestQueue);
  assert.ok(improved.busDelay < original.results.busDelay);
  assert.ok(improved.waiting < original.results.waiting);
});

test("the editable taper is continuous and congested traffic alternates through it", () => {
  const design = { ...baseline, lanes: 2 };
  const run = simulate(design);
  const short = { ...design, mergeEnd: 250 };
  const before = mergeTaper(design);
  const after = mergeTaper(short);
  assert.equal(before.start + 26, after.start);
  assert.equal(before.end + 26, after.end);
  assert.notDeepEqual(run.results, simulate(short).results);

  const crossings = [];
  let previous = new Map();
  for (const frame of run.frames) {
    for (const car of frame.markers) {
      const last = previous.get(car.id);
      if (!last) continue;
      assert.ok(Math.hypot(car.x - last.x, car.y - last.y) * scale < 3.3, `Vehicle ${car.id} jumped`);
      if (last.y > before.end && car.y <= before.end && car.lane === "outer") crossings.push(car.kind === "pickup");
    }
    previous = new Map(frame.markers.map(car => [car.id, car]));
  }
  const firstMerge = crossings.indexOf(true);
  assert.ok(firstMerge >= 0);
  assert.deepEqual(crossings.slice(firstMerge, firstMerge + 10), [true, false, true, false, true, false, true, false, true, false]);
  assert.ok(run.frames.some(frame => frame.markers.some(car =>
    car.lane === "auxiliary" && car.x > world.outer && car.x < world.auxiliary)));
});

function body(marker) {
  const { length, width } = vehicleDimensions(marker.kind);
  const forward = [Math.cos(marker.angle), Math.sin(marker.angle)];
  const lateral = [-forward[1], forward[0]];
  return { x: marker.x, y: marker.y, axes: [forward, lateral], half: [length / (2 * scale), width / (2 * scale)] };
}

// Independent oriented-rectangle check for rendered vehicle body dimensions.
function overlaps(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  if (Math.abs(dx) > 15 || Math.abs(dy) > 15) return false;
  const extent = (body, x, y) => body.half.reduce((sum, half, i) =>
    sum + half * Math.abs(body.axes[i][0] * x + body.axes[i][1] * y), 0);
  return [...a.axes, ...b.axes].every(([x, y]) =>
    Math.abs(dx * x + dy * y) < extent(a, x, y) + extent(b, x, y) - 1e-7);
}

test("vehicles keep their clearance in simulation and between replay samples", () => {
  const cases = [
    baseline,
    { ...baseline, lanes: 2, mergeEnd: 250 },
    { ...baseline, lanes: 3, node: 375, entry: 25, exit: 125, mergeEnd: 315 },
    { ...baseline, lanes: 3, node: 275, entry: 125, exit: 20, mergeEnd: 221 }
  ];
  for (const design of cases) {
    const { frames, results } = simulate(design);
    assert.ok(results.finished > 25, "The merge must continue to discharge traffic");
    for (let sample = 0; sample < frames.length * 2 - 1; sample++) {
      const time = sample * step / 2;
      const bodies = replayMarkers(frames, time).map(body);
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          assert.ok(!overlaps(bodies[i], bodies[j]), `Overlap at ${time}s in ${JSON.stringify(design)}`);
        }
      }
    }
  }
});

test("invalid designs cannot strand the pickup route or reach the engine", () => {
  assert.ok(validate(JSON.parse(JSON.stringify(baseline))));
  assert.equal(validate({ ...baseline, lanes: 0 }), false);
  assert.equal(validate({ ...baseline, node: 400 }), false);
  assert.equal(validate({ ...baseline, mergeEnd: 270 }), false);
  const { mergeEnd, ...legacy } = { ...baseline, node: 275, lanes: 2 };
  assert.ok(validate(legacy));
  assert.equal(mergeTaper(legacy).end, 221);
  assert.throws(() => simulate({ ...baseline, exit: NaN }), /Invalid corridor design/);
});
